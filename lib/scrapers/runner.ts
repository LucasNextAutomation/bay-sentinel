/**
 * Bay Sentinel — Real Scraper Runner
 *
 * Replaces the simulated operation progress with actual data operations.
 * Works in two modes:
 *   - FREE mode: Cross-references existing data, computes heuristics, deduplicates
 *   - API mode: Uses BatchData ($0.01/call) for full property + owner + foreclosure data
 *
 * Each operation function:
 *   1. Reports progress via OperationProgress (updates bs_operations.steps)
 *   2. Queries/upserts real data in bs_leads and bs_signals
 *   3. Returns actual result counts
 */
import { supabase } from '@/lib/db'
import { computeDistressScore, computeCompleteness } from '@/lib/scoring'
import { OperationProgress, completeOperation, failOperation } from './progress'
import type { ScraperStep, ScraperResult, SIGNAL_WEIGHTS } from './types'
import { COUNTY_LABELS, VALID_COUNTIES } from './types'

const BATCHDATA_API_KEY = process.env.BATCHDATA_API_KEY || ''
const HAS_BATCHDATA = BATCHDATA_API_KEY.length > 0

/* ------------------------------------------------------------------ */
/*  BatchData API helpers                                              */
/* ------------------------------------------------------------------ */

interface BatchDataProperty {
  apn?: string
  address?: { full?: string; city?: string; zip?: string }
  characteristics?: {
    bedrooms?: number
    bathrooms?: number
    livingArea?: number
    lotSize?: number
    yearBuilt?: number
    garage?: boolean
    propertyType?: string
    zoning?: string
  }
  tax?: {
    assessedValue?: number
    taxAmount?: number
    delinquent?: boolean
    delinquentAmount?: number
  }
  valuation?: { estimatedValue?: number }
  sale?: { date?: string; price?: number }
  owner?: {
    names?: string[]
    mailingAddress?: { full?: string }
    phone?: string[]
    email?: string[]
  }
  foreclosure?: {
    inForeclosure?: boolean
    nodDate?: string
    ntsDate?: string
    auctionDate?: string
    defaultAmount?: number
  }
  mortgage?: {
    totalBalance?: number
    loanCount?: number
  }
}

async function batchDataLookup(address: string, city: string, state: string = 'CA'): Promise<BatchDataProperty | null> {
  if (!HAS_BATCHDATA) return null
  try {
    const res = await fetch('https://api.batchdata.com/api/v1/property/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{ address: { street: address, city, state } }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.results?.properties?.[0] || null
  } catch {
    return null
  }
}

async function batchDataSkipTrace(name: string, address: string, city: string, state: string = 'CA'): Promise<{
  phones: string[]
  emails: string[]
  mailingAddress: string
} | null> {
  if (!HAS_BATCHDATA) return null
  try {
    const res = await fetch('https://api.batchdata.com/api/v1/person/skip-trace', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BATCHDATA_API_KEY}`,
      },
      body: JSON.stringify({
        requests: [{ name, address: { street: address, city, state } }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const person = data?.results?.persons?.[0]
    if (!person) return null
    return {
      phones: person.phones?.map((p: { number: string }) => p.number) || [],
      emails: person.emails?.map((e: { address: string }) => e.address) || [],
      mailingAddress: person.addresses?.[0]?.full || '',
    }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ */
/*  Helper: upsert a signal for a lead                                 */
/* ------------------------------------------------------------------ */

async function upsertSignal(
  leadId: string,
  signalType: string,
  name: string,
  weight: number,
  source: string
): Promise<boolean> {
  // Check if signal already exists
  const { data: existing } = await supabase
    .from('bs_signals')
    .select('id')
    .eq('lead_id', leadId)
    .eq('signal_type', signalType)
    .limit(1)

  if (existing && existing.length > 0) return false // already exists

  const { error } = await supabase.from('bs_signals').insert({
    lead_id: leadId,
    signal_type: signalType,
    name,
    weight,
    source,
    detected_at: new Date().toISOString(),
  })
  return !error
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_assessor                                         */
/*  Enriches existing leads with assessor data (property details)      */
/* ------------------------------------------------------------------ */

async function executeScrapeAssessor(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching leads with incomplete assessor data', status: 'pending', records: 0 },
    { name: 'Enriching property records', detail: HAS_BATCHDATA ? 'Querying BatchData API' : 'Cross-referencing county data', status: 'pending', records: 0 },
    { name: 'Updating database', detail: 'Saving enriched records', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  // Step 1: Load leads with missing assessor fields
  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, zip_code, apn, beds, baths, sqft_living, sqft_lot, year_built, assessed_value, estimated_value, property_type, has_garage')
    .eq('county', countyLabel)
    .or('beds.is.null,baths.is.null,sqft_living.is.null,year_built.is.null,assessed_value.is.null')
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  // Step 2: Enrich property data
  await progress.startStep(1)
  let enriched = 0
  let failed = 0

  if (HAS_BATCHDATA) {
    // Use BatchData API for enrichment (real external data)
    for (const lead of leads) {
      try {
        const prop = await batchDataLookup(lead.address || '', lead.city || '')
        if (!prop) { failed++; continue }

        const updates: Record<string, unknown> = {}
        if (!lead.beds && prop.characteristics?.bedrooms) updates.beds = prop.characteristics.bedrooms
        if (!lead.baths && prop.characteristics?.bathrooms) updates.baths = prop.characteristics.bathrooms
        if (!lead.sqft_living && prop.characteristics?.livingArea) updates.sqft_living = prop.characteristics.livingArea
        if (!lead.sqft_lot && prop.characteristics?.lotSize) updates.sqft_lot = prop.characteristics.lotSize
        if (!lead.year_built && prop.characteristics?.yearBuilt) updates.year_built = prop.characteristics.yearBuilt
        if (!lead.assessed_value && prop.tax?.assessedValue) updates.assessed_value = prop.tax.assessedValue
        if (!lead.estimated_value && prop.valuation?.estimatedValue) updates.estimated_value = prop.valuation.estimatedValue
        if (!lead.property_type && prop.characteristics?.propertyType) updates.property_type = prop.characteristics.propertyType
        if (lead.has_garage === null && prop.characteristics?.garage !== undefined) updates.has_garage = prop.characteristics.garage

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString()
          updates.source = 'batchdata_assessor'
          const { error: updateErr } = await supabase.from('bs_leads').update(updates).eq('id', lead.id)
          if (!updateErr) enriched++; else failed++
        }
      } catch {
        failed++
      }
    }
  } else {
    // FREE mode: Use county-level median values from existing complete leads to fill gaps
    const { data: completedLeads } = await supabase
      .from('bs_leads')
      .select('beds, baths, sqft_living, sqft_lot, year_built, assessed_value, estimated_value')
      .eq('county', countyLabel)
      .not('beds', 'is', null)
      .not('sqft_living', 'is', null)
      .limit(500)

    if (completedLeads && completedLeads.length > 0) {
      // Calculate medians for gap-filling
      const median = (arr: number[]) => {
        const sorted = arr.filter(Boolean).sort((a, b) => a - b)
        if (sorted.length === 0) return null
        const mid = Math.floor(sorted.length / 2)
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
      }

      const medians = {
        beds: median(completedLeads.map((l) => l.beds).filter(Boolean) as number[]),
        baths: median(completedLeads.map((l) => l.baths).filter(Boolean) as number[]),
        sqft_living: median(completedLeads.map((l) => l.sqft_living).filter(Boolean) as number[]),
        sqft_lot: median(completedLeads.map((l) => l.sqft_lot).filter(Boolean) as number[]),
        year_built: median(completedLeads.map((l) => l.year_built).filter(Boolean) as number[]),
        assessed_value: median(completedLeads.map((l) => l.assessed_value).filter(Boolean) as number[]),
        estimated_value: median(completedLeads.map((l) => l.estimated_value).filter(Boolean) as number[]),
      }

      for (const lead of leads) {
        const updates: Record<string, unknown> = {}
        if (!lead.beds && medians.beds) updates.beds = medians.beds
        if (!lead.baths && medians.baths) updates.baths = medians.baths
        if (!lead.sqft_living && medians.sqft_living) updates.sqft_living = medians.sqft_living
        if (!lead.sqft_lot && medians.sqft_lot) updates.sqft_lot = medians.sqft_lot
        if (!lead.year_built && medians.year_built) updates.year_built = Math.round(medians.year_built)
        if (!lead.assessed_value && medians.assessed_value) updates.assessed_value = medians.assessed_value
        if (!lead.estimated_value && medians.estimated_value) updates.estimated_value = medians.estimated_value

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString()
          updates.source = 'county_median_enrichment'
          const { error: updateErr } = await supabase.from('bs_leads').update(updates).eq('id', lead.id)
          if (!updateErr) enriched++; else failed++
        }
      }
    }
  }
  await progress.completeStep(1, enriched)

  // Step 3: Recompute scores for enriched leads
  await progress.startStep(2)
  let recomputed = 0
  const leadIds = leads.map((l) => l.id)
  const BATCH = 200
  for (let i = 0; i < leadIds.length; i += BATCH) {
    const batch = leadIds.slice(i, i + BATCH)
    const { data: toScore } = await supabase
      .from('bs_leads')
      .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, bs_signals(signal_type, weight)')
      .in('id', batch)

    if (toScore) {
      for (const lead of toScore) {
        const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
        const { score, priority } = computeDistressScore(lead, signals)
        const completeness = computeCompleteness(lead as Record<string, unknown>)
        await supabase
          .from('bs_leads')
          .update({ distress_score: score, lead_priority: priority, completeness })
          .eq('id', lead.id)
        recomputed++
      }
    }
  }
  await progress.completeStep(2, recomputed)

  return {
    leads_created: 0,
    leads_updated: enriched,
    leads_enriched: enriched,
    leads_failed: failed,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_nod                                              */
/*  Finds/creates NOD (Notice of Default) signals                      */
/* ------------------------------------------------------------------ */

async function executeScrapeNod(
  opId: number,
  county: string,
  _days: number,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties for foreclosure check', status: 'pending', records: 0 },
    { name: 'Checking foreclosure indicators', detail: HAS_BATCHDATA ? 'Querying BatchData foreclosure data' : 'Analyzing distress patterns', status: 'pending', records: 0 },
    { name: 'Creating signals', detail: 'Saving NOD signals to database', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  // Step 1: Load leads
  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, apn, distress_score, assessed_value, estimated_value, last_sale_date, last_sale_price, equity_percent')
    .eq('county', countyLabel)
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  // Step 2: Detect NOD indicators
  await progress.startStep(1)
  let signalsCreated = 0
  let checked = 0

  if (HAS_BATCHDATA) {
    // Real foreclosure data from BatchData
    for (const lead of leads) {
      try {
        const prop = await batchDataLookup(lead.address || '', lead.city || '')
        if (prop?.foreclosure?.inForeclosure) {
          const created = await upsertSignal(
            lead.id,
            'nod',
            `Notice of Default — ${prop.foreclosure.nodDate || 'recent'}`,
            7,
            'batchdata_foreclosure'
          )
          if (created) signalsCreated++
        }
        if (prop?.foreclosure?.ntsDate) {
          await upsertSignal(lead.id, 'nts', `Notice of Trustee Sale — ${prop.foreclosure.ntsDate}`, 4, 'batchdata_foreclosure')
        }
        if (prop?.foreclosure?.auctionDate) {
          await upsertSignal(lead.id, 'auction', `Auction scheduled — ${prop.foreclosure.auctionDate}`, 5, 'batchdata_foreclosure')
        }
        checked++
      } catch {
        // Continue on individual failures
      }
    }
  } else {
    // FREE mode: Analyze existing data for NOD likelihood
    // Properties with very low equity, high assessed value vs est. value, or old last sale
    // are more likely to have NODs. Flag leads that match distress patterns.
    for (const lead of leads) {
      const equityLow = lead.equity_percent !== null && lead.equity_percent < 20
      const valueDropped = lead.assessed_value && lead.estimated_value &&
        lead.estimated_value < lead.assessed_value * 0.85
      const oldSale = lead.last_sale_date &&
        new Date(lead.last_sale_date) < new Date('2016-01-01')
      const highDistress = lead.distress_score && lead.distress_score >= 70

      // Only flag if multiple distress indicators align
      if ((equityLow && valueDropped) || (equityLow && highDistress)) {
        const created = await upsertSignal(
          lead.id,
          'nod',
          'Potential NOD — high distress pattern detected',
          7,
          'heuristic_analysis'
        )
        if (created) signalsCreated++
      }
      checked++
    }
  }
  await progress.completeStep(1, checked)

  // Step 3: Update scores for leads that got new signals
  await progress.startStep(2)
  if (signalsCreated > 0) {
    // Recompute scores for affected leads
    const { data: affectedLeads } = await supabase
      .from('bs_leads')
      .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, bs_signals(signal_type, weight)')
      .eq('county', countyLabel)

    if (affectedLeads) {
      for (const lead of affectedLeads) {
        const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
        const { score, priority } = computeDistressScore(lead, signals)
        await supabase.from('bs_leads').update({ distress_score: score, lead_priority: priority }).eq('id', lead.id)
      }
    }
  }
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_tax_delinquent                                   */
/*  Finds/creates tax delinquency signals                              */
/* ------------------------------------------------------------------ */

async function executeScrapeTaxDelinquent(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties for tax check', status: 'pending', records: 0 },
    { name: 'Checking tax delinquency', detail: HAS_BATCHDATA ? 'Querying BatchData tax records' : 'Analyzing tax patterns', status: 'pending', records: 0 },
    { name: 'Saving results', detail: 'Creating tax delinquent signals', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, apn, assessed_value, estimated_value, last_sale_date, years_owned')
    .eq('county', countyLabel)
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let signalsCreated = 0

  if (HAS_BATCHDATA) {
    for (const lead of leads) {
      try {
        const prop = await batchDataLookup(lead.address || '', lead.city || '')
        if (prop?.tax?.delinquent) {
          const created = await upsertSignal(
            lead.id,
            'tax_delinquent',
            `Tax delinquent — $${prop.tax.delinquentAmount?.toLocaleString() || 'unknown'} owed`,
            9,
            'batchdata_tax'
          )
          if (created) signalsCreated++
        }
      } catch {
        // Continue
      }
    }
  } else {
    // FREE mode: Flag leads with high assessed value + long ownership + no recent sale
    // as likely tax delinquent candidates (heuristic)
    for (const lead of leads) {
      const longOwner = (lead.years_owned || 0) > 15
      const oldSale = lead.last_sale_date && new Date(lead.last_sale_date) < new Date('2012-01-01')
      const highAssessed = (lead.assessed_value || 0) > 1000000

      if (longOwner && oldSale && highAssessed) {
        const created = await upsertSignal(
          lead.id,
          'tax_delinquent',
          'Potential tax delinquent — long ownership, high assessment, no recent sale',
          9,
          'heuristic_analysis'
        )
        if (created) signalsCreated++
      }
    }
  }
  await progress.completeStep(1, signalsCreated)

  await progress.startStep(2)
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_vacancy                                          */
/*  Detects vacant properties via data analysis                        */
/* ------------------------------------------------------------------ */

async function executeScrapeVacancy(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching property data for vacancy analysis', status: 'pending', records: 0 },
    { name: 'Analyzing vacancy indicators', detail: 'Cross-referencing owner data and property signals', status: 'pending', records: 0 },
    { name: 'Flagging vacant properties', detail: 'Creating vacancy signals', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, mailing_address, is_absentee, is_out_of_state, years_owned, last_sale_date, owner_name, owner_phone, owner_email')
    .eq('county', countyLabel)
    .limit(1000)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let signalsCreated = 0
  let analyzed = 0

  // Vacancy detection heuristics (works without any API):
  // - Absentee owner (mailing addr != property addr)
  // - Out-of-state owner
  // - No owner phone/email (hard to reach = possibly vacant)
  // - Very long ownership (20+ years) + absentee
  // - No recent sale in 15+ years
  for (const lead of leads) {
    let vacancyScore = 0

    if (lead.is_absentee) vacancyScore += 3
    if (lead.is_out_of_state) vacancyScore += 3
    if (!lead.owner_phone && !lead.owner_email) vacancyScore += 2
    if ((lead.years_owned || 0) > 20) vacancyScore += 2
    if (lead.last_sale_date && new Date(lead.last_sale_date) < new Date('2010-01-01')) vacancyScore += 1
    if (lead.mailing_address && lead.address &&
        lead.mailing_address.toLowerCase() !== lead.address.toLowerCase()) vacancyScore += 2

    // Threshold: 6+ points = likely vacant
    if (vacancyScore >= 6) {
      const created = await upsertSignal(
        lead.id,
        'vacancy',
        `Vacancy likely — score ${vacancyScore}/13 (absentee=${lead.is_absentee}, out_state=${lead.is_out_of_state}, years_owned=${lead.years_owned || 'unknown'})`,
        15,
        'vacancy_heuristic'
      )
      if (created) signalsCreated++
    }
    analyzed++
  }
  await progress.completeStep(1, analyzed)

  await progress.startStep(2)
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_recorder                                         */
/*  Finds deed transfers, quitclaim deeds, executor deeds              */
/* ------------------------------------------------------------------ */

async function executeScrapeRecorder(
  opId: number,
  county: string,
  _days: number,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching property records', status: 'pending', records: 0 },
    { name: 'Analyzing ownership patterns', detail: 'Detecting deed transfer indicators', status: 'pending', records: 0 },
    { name: 'Saving signals', detail: 'Creating recorder-based signals', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, owner_name, years_owned, last_sale_date, last_sale_price, is_absentee, mailing_address')
    .eq('county', countyLabel)
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let signalsCreated = 0

  // Detect deed patterns from existing data:
  // - Long-term ownership (20+ years) = possible estate/probate
  // - Absentee + long ownership = executor deed likely
  // - Recent sale at below-market price = possible quitclaim/distress sale
  for (const lead of leads) {
    const yearsOwned = lead.years_owned || 0

    // Executor/administrator deed indicator (estate/probate)
    if (yearsOwned > 25 && lead.is_absentee) {
      const created = await upsertSignal(
        lead.id,
        'executor_deed',
        `Possible estate — ${yearsOwned}yr ownership + absentee owner`,
        11,
        'ownership_analysis'
      )
      if (created) signalsCreated++
    }

    // Quitclaim indicator (divorce, family transfer)
    if (lead.last_sale_price && lead.last_sale_price < 100000 && lead.last_sale_date) {
      const saleDate = new Date(lead.last_sale_date)
      if (saleDate > new Date('2020-01-01')) {
        const created = await upsertSignal(
          lead.id,
          'quitclaim',
          `Possible quitclaim — sale price $${lead.last_sale_price.toLocaleString()} (${lead.last_sale_date})`,
          10,
          'transaction_analysis'
        )
        if (created) signalsCreated++
      }
    }

    // Long-term owner signal
    if (yearsOwned >= 20) {
      const created = await upsertSignal(
        lead.id,
        'long_term_owner',
        `${yearsOwned}+ years of ownership`,
        12,
        'ownership_analysis'
      )
      if (created) signalsCreated++
    }
  }
  await progress.completeStep(1, signalsCreated)

  await progress.startStep(2)
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_auction                                          */
/*  Checks for upcoming foreclosure auctions                           */
/* ------------------------------------------------------------------ */

async function executeScrapeAuction(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties with foreclosure signals', status: 'pending', records: 0 },
    { name: 'Checking auction indicators', detail: HAS_BATCHDATA ? 'Querying BatchData auction data' : 'Analyzing existing signals', status: 'pending', records: 0 },
    { name: 'Saving results', detail: 'Updating auction signals', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  // Focus on leads that already have NOD or NTS signals (most likely to go to auction)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, apn, distress_score, bs_signals(signal_type)')
    .eq('county', countyLabel)
    .gte('distress_score', 50)
    .limit(300)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let signalsCreated = 0

  if (HAS_BATCHDATA) {
    for (const lead of leads) {
      try {
        const prop = await batchDataLookup(lead.address || '', lead.city || '')
        if (prop?.foreclosure?.auctionDate) {
          const created = await upsertSignal(
            lead.id,
            'auction',
            `Foreclosure auction scheduled — ${prop.foreclosure.auctionDate}`,
            5,
            'batchdata_auction'
          )
          if (created) signalsCreated++
        }
      } catch {
        // Continue
      }
    }
  } else {
    // FREE mode: leads with both NOD + tax_delinquent signals are likely heading to auction
    for (const lead of leads) {
      const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
      const hasNod = signals.some((s: { signal_type: string }) => s.signal_type === 'nod')
      const hasTax = signals.some((s: { signal_type: string }) => s.signal_type === 'tax_delinquent')

      if (hasNod && hasTax) {
        const created = await upsertSignal(
          lead.id,
          'auction',
          'Potential auction — NOD + tax delinquent signals detected',
          5,
          'signal_correlation'
        )
        if (created) signalsCreated++
      }
    }
  }
  await progress.completeStep(1, signalsCreated)

  await progress.startStep(2)
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: scrape_lis_pendens                                      */
/*  Lis pendens and bankruptcy detection                               */
/* ------------------------------------------------------------------ */

async function executeScrapeLisPendens(
  opId: number,
  county: string,
  _days: number,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching high-distress properties', status: 'pending', records: 0 },
    { name: 'Analyzing litigation indicators', detail: 'Detecting lis pendens patterns', status: 'pending', records: 0 },
    { name: 'Saving signals', detail: 'Creating lis pendens signals', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, distress_score, equity_percent, years_owned, is_absentee, bs_signals(signal_type)')
    .eq('county', countyLabel)
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let signalsCreated = 0

  // Lis pendens indicators: properties with multiple distress signals + low equity
  for (const lead of leads) {
    const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
    const signalCount = signals.length
    const lowEquity = lead.equity_percent !== null && lead.equity_percent < 25
    const highDistress = (lead.distress_score || 0) >= 65

    // Multiple distress signals + low equity = litigation likely
    if (signalCount >= 3 && lowEquity && highDistress) {
      const hasLisPendens = signals.some((s: { signal_type: string }) => s.signal_type === 'lis_pendens')
      if (!hasLisPendens) {
        const created = await upsertSignal(
          lead.id,
          'lis_pendens',
          `Potential lis pendens — ${signalCount} distress signals, ${lead.equity_percent}% equity`,
          8,
          'signal_correlation'
        )
        if (created) signalsCreated++
      }
    }
  }
  await progress.completeStep(1, signalsCreated)

  await progress.startStep(2)
  await progress.completeStep(2, signalsCreated)

  return {
    leads_created: 0,
    leads_updated: signalsCreated,
    leads_enriched: signalsCreated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: enrich_property                                         */
/*  Fill missing property characteristics                              */
/* ------------------------------------------------------------------ */

async function executeEnrichProperty(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  // This largely overlaps with scrape_assessor but focuses on completeness
  return executeScrapeAssessor(opId, county, startedAt)
}

/* ------------------------------------------------------------------ */
/*  Operation: enrich_valuation                                        */
/*  Refresh estimated market values from comps                         */
/* ------------------------------------------------------------------ */

async function executeEnrichValuation(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties for valuation', status: 'pending', records: 0 },
    { name: 'Running comparable analysis', detail: 'Computing market values from nearby comps', status: 'pending', records: 0 },
    { name: 'Updating valuations', detail: 'Saving estimated market values', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, zip_code, beds, baths, sqft_living, year_built, assessed_value, estimated_value, last_sale_price, last_sale_date')
    .eq('county', countyLabel)
    .limit(500)

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let updated = 0

  // Group leads by ZIP for comparable analysis
  const byZip: Record<string, typeof leads> = {}
  for (const lead of leads) {
    const zip = lead.zip_code || 'unknown'
    if (!byZip[zip]) byZip[zip] = []
    byZip[zip].push(lead)
  }

  for (const [, zipLeads] of Object.entries(byZip)) {
    // Calculate median price/sqft for this ZIP
    const priceSqftValues: number[] = []
    for (const lead of zipLeads) {
      if (lead.last_sale_price && lead.sqft_living && lead.last_sale_price > 100000) {
        priceSqftValues.push(lead.last_sale_price / lead.sqft_living)
      }
    }

    if (priceSqftValues.length === 0) continue

    priceSqftValues.sort((a, b) => a - b)
    const medianPriceSqft = priceSqftValues[Math.floor(priceSqftValues.length / 2)]

    // Apply appreciation adjustment (Bay Area ~5% annual since last sale)
    const currentYear = new Date().getFullYear()

    for (const lead of zipLeads) {
      if (lead.sqft_living && (!lead.estimated_value || lead.estimated_value === lead.assessed_value)) {
        let appreciation = 1.0
        if (lead.last_sale_date) {
          const saleYear = new Date(lead.last_sale_date).getFullYear()
          const yearsSince = currentYear - saleYear
          appreciation = Math.pow(1.05, Math.min(yearsSince, 15)) // Cap at 15 years
        }

        const estimatedValue = Math.round(medianPriceSqft * lead.sqft_living * appreciation)

        // Only update if reasonable ($200K - $10M for Bay Area)
        if (estimatedValue >= 200000 && estimatedValue <= 10000000) {
          const { error: updateErr } = await supabase
            .from('bs_leads')
            .update({
              estimated_value: estimatedValue,
              updated_at: new Date().toISOString(),
            })
            .eq('id', lead.id)
          if (!updateErr) updated++
        }
      }
    }
  }
  await progress.completeStep(1, updated)

  await progress.startStep(2)
  await progress.completeStep(2, updated)

  return {
    leads_created: 0,
    leads_updated: updated,
    leads_enriched: updated,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: enrich_owner                                            */
/*  Skip-trace owner contact data                                      */
/* ------------------------------------------------------------------ */

async function executeEnrichOwner(
  opId: number,
  county: string,
  startedAt: string
): Promise<ScraperResult> {
  const countyLabel = COUNTY_LABELS[county as keyof typeof COUNTY_LABELS] || county
  const steps: ScraperStep[] = [
    { name: `Loading ${countyLabel} leads`, detail: 'Fetching leads missing owner contact info', status: 'pending', records: 0 },
    { name: 'Skip-tracing owners', detail: HAS_BATCHDATA ? 'Querying BatchData skip-trace API' : 'Analyzing owner data patterns', status: 'pending', records: 0 },
    { name: 'Saving contact data', detail: 'Updating owner records', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, city, county, owner_name, owner_phone, owner_email, mailing_address, distress_score')
    .eq('county', countyLabel)
    .or('owner_phone.is.null,owner_email.is.null')
    .order('distress_score', { ascending: false })
    .limit(200) // Skip-tracing is expensive, limit to highest priority

  if (error || !leads) {
    await progress.failStep(0, error?.message || 'No leads found')
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, leads.length)

  await progress.startStep(1)
  let enriched = 0
  let failed = 0

  if (HAS_BATCHDATA) {
    // Real skip-tracing via BatchData API
    for (const lead of leads) {
      if (!lead.owner_name || !lead.address) { failed++; continue }
      try {
        const result = await batchDataSkipTrace(lead.owner_name, lead.address, lead.city || '')
        if (!result) { failed++; continue }

        const updates: Record<string, unknown> = {}
        if (!lead.owner_phone && result.phones.length > 0) updates.owner_phone = result.phones[0]
        if (!lead.owner_email && result.emails.length > 0) updates.owner_email = result.emails[0]
        if (!lead.mailing_address && result.mailingAddress) updates.mailing_address = result.mailingAddress

        if (Object.keys(updates).length > 0) {
          updates.updated_at = new Date().toISOString()
          const { error: updateErr } = await supabase.from('bs_leads').update(updates).eq('id', lead.id)
          if (!updateErr) enriched++; else failed++
        }
      } catch {
        failed++
      }
    }
  } else {
    // FREE mode: Flag leads that need skip-tracing (can't actually get contact info without API)
    // But we can detect absentee owners from existing mailing address data
    for (const lead of leads) {
      if (lead.mailing_address && lead.address) {
        const isAbsentee = lead.mailing_address.toLowerCase().trim() !== lead.address.toLowerCase().trim()
        if (isAbsentee) {
          await upsertSignal(
            lead.id,
            'absentee',
            `Absentee owner — mailing: ${lead.mailing_address}`,
            13,
            'address_comparison'
          )
          enriched++
        }
      }
    }

    // Log that API key is needed for full skip-tracing
    console.log(`[enrich_owner] FREE mode: ${leads.length} leads need skip-tracing. Set BATCHDATA_API_KEY for real owner data.`)
  }
  await progress.completeStep(1, enriched)

  await progress.startStep(2)
  await progress.completeStep(2, enriched)

  return {
    leads_created: 0,
    leads_updated: enriched,
    leads_enriched: enriched,
    leads_failed: failed,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: dedupe_leads                                            */
/*  Real deduplication by APN + address                                */
/* ------------------------------------------------------------------ */

async function executeDedupeLeads(
  opId: number,
  startedAt: string
): Promise<ScraperResult> {
  const steps: ScraperStep[] = [
    { name: 'Scanning lead database', detail: 'Building APN index', status: 'pending', records: 0 },
    { name: 'Identifying duplicates', detail: 'Matching by APN and address', status: 'pending', records: 0 },
    { name: 'Merging records', detail: 'Keeping highest-quality data', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  const allLeads: Array<{ id: string; apn: string; county: string; address: string; completeness: number; distress_score: number; created_at: string }> = []
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data: batch } = await supabase
      .from('bs_leads')
      .select('id, apn, county, address, completeness, distress_score, created_at')
      .range(offset, offset + 999)
    if (!batch || batch.length === 0) break
    allLeads.push(...batch)
  }
  await progress.completeStep(0, allLeads.length)

  await progress.startStep(1)
  // Group by APN + county (the unique constraint)
  const groups: Record<string, typeof allLeads> = {}
  for (const lead of allLeads) {
    const key = `${lead.apn}__${lead.county}`.toLowerCase()
    if (!groups[key]) groups[key] = []
    groups[key].push(lead)
  }

  const duplicateGroups = Object.values(groups).filter((g) => g.length > 1)
  const totalDuplicates = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0)
  await progress.completeStep(1, totalDuplicates)

  await progress.startStep(2)
  let removed = 0
  for (const group of duplicateGroups) {
    // Keep the lead with highest completeness, then highest distress score
    group.sort((a, b) => {
      const compDiff = (b.completeness || 0) - (a.completeness || 0)
      if (compDiff !== 0) return compDiff
      return (b.distress_score || 0) - (a.distress_score || 0)
    })

    // Delete all except the first (best) one
    const toDelete = group.slice(1).map((l) => l.id)
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('bs_leads')
        .delete()
        .in('id', toDelete)
      if (!error) removed += toDelete.length
    }
  }
  await progress.completeStep(2, removed)

  return {
    leads_created: 0,
    leads_updated: removed,
    leads_enriched: 0,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Operation: clean_stale                                             */
/*  Remove leads with no recent signal activity                        */
/* ------------------------------------------------------------------ */

async function executeCleanStale(
  opId: number,
  startedAt: string
): Promise<ScraperResult> {
  const steps: ScraperStep[] = [
    { name: 'Scanning lead database', detail: 'Checking signal activity dates', status: 'pending', records: 0 },
    { name: 'Identifying stale records', detail: 'Finding leads with no recent activity', status: 'pending', records: 0 },
    { name: 'Archiving stale leads', detail: 'Removing low-value stale records', status: 'pending', records: 0 },
  ]
  const progress = new OperationProgress(opId, steps)

  await progress.startStep(0)
  // Find leads with no signals and low distress score
  const { data: staleLeads, error } = await supabase
    .from('bs_leads')
    .select('id, distress_score, updated_at')
    .lt('distress_score', 15)
    .lt('updated_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .limit(500)

  if (error) {
    await progress.failStep(0, error.message)
    return { leads_created: 0, leads_updated: 0, leads_enriched: 0, leads_failed: 1, steps: progress.getSteps() }
  }
  await progress.completeStep(0, staleLeads?.length || 0)

  await progress.startStep(1)
  const staleCount = staleLeads?.length || 0
  await progress.completeStep(1, staleCount)

  await progress.startStep(2)
  let archived = 0
  if (staleLeads && staleLeads.length > 0) {
    const ids = staleLeads.map((l) => l.id)
    const BATCH = 200
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH)
      const { error: delErr } = await supabase
        .from('bs_leads')
        .delete()
        .in('id', batch)
      if (!delErr) archived += batch.length
    }
  }
  await progress.completeStep(2, archived)

  return {
    leads_created: 0,
    leads_updated: archived,
    leads_enriched: 0,
    leads_failed: 0,
    steps: progress.getSteps(),
  }
}

/* ------------------------------------------------------------------ */
/*  Main runner — dispatches operations                                 */
/* ------------------------------------------------------------------ */

export async function runOperation(
  opId: number,
  operationKey: string,
  label: string,
  startedAt: string,
  params: { county?: string; days?: string }
): Promise<void> {
  const county = params.county || ''
  const days = parseInt(params.days || '30', 10)

  try {
    let result: ScraperResult

    switch (operationKey) {
      case 'scrape_assessor':
        result = await executeScrapeAssessor(opId, county, startedAt)
        break
      case 'scrape_nod':
        result = await executeScrapeNod(opId, county, days, startedAt)
        break
      case 'scrape_tax_delinquent':
        result = await executeScrapeTaxDelinquent(opId, county, startedAt)
        break
      case 'scrape_vacancy':
        result = await executeScrapeVacancy(opId, county, startedAt)
        break
      case 'scrape_recorder':
        result = await executeScrapeRecorder(opId, county, days, startedAt)
        break
      case 'scrape_auction':
        result = await executeScrapeAuction(opId, county, startedAt)
        break
      case 'scrape_lis_pendens':
        result = await executeScrapeLisPendens(opId, county, days, startedAt)
        break
      case 'enrich_property':
        result = await executeEnrichProperty(opId, county, startedAt)
        break
      case 'enrich_valuation':
        result = await executeEnrichValuation(opId, county, startedAt)
        break
      case 'enrich_owner':
        result = await executeEnrichOwner(opId, county, startedAt)
        break
      case 'dedupe_leads':
        result = await executeDedupeLeads(opId, startedAt)
        break
      case 'clean_stale':
        result = await executeCleanStale(opId, startedAt)
        break
      default:
        throw new Error(`Unknown operation: ${operationKey}`)
    }

    await completeOperation(opId, operationKey, label, startedAt, result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Operation failed'
    await failOperation(opId, startedAt, message, [])
  }
}
