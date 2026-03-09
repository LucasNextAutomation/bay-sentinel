import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { computeDistressScore, computeCompleteness } from '@/lib/scoring'
import { syncToGoogleSheet } from '@/lib/google-sheets'

/* ------------------------------------------------------------------ */
/*  Operation definitions (duplicated intentionally to keep route     */
/*  self-contained — the operations/ route serves the full config)    */
/* ------------------------------------------------------------------ */
const OPERATIONS: Record<string, { label: string; requires: string[] }> = {
  scrape_nod:            { label: 'Scrape NOD Records',             requires: ['county', 'days'] },
  scrape_auction:        { label: 'Scrape Auction Listings',        requires: ['county'] },
  scrape_tax_delinquent: { label: 'Scrape Tax Delinquent Properties', requires: ['county'] },
  scrape_vacancy:        { label: 'Detect Vacant Properties',       requires: ['county'] },
  scrape_assessor:       { label: 'Scrape County Assessor Records', requires: ['county', 'days'] },
  scrape_recorder:       { label: 'Scrape Recorder Documents',      requires: ['county', 'days'] },
  scrape_lis_pendens:    { label: 'Scrape Lis Pendens & Bankruptcy', requires: ['county', 'days'] },
  enrich_property:       { label: 'Enrich Property Data',           requires: ['county'] },
  enrich_valuation:      { label: 'Update Valuations',              requires: ['county'] },
  compute_scores:        { label: 'Recompute Distress Scores',      requires: [] },
  enrich_owner:          { label: 'Skip-Trace Owner Data',          requires: ['county'] },
  detect_absentee:       { label: 'Detect Absentee Owners',         requires: [] },
  dedupe_leads:          { label: 'Deduplicate Leads',              requires: [] },
  clean_stale:           { label: 'Clean Stale Records',            requires: [] },
  export_sheets:         { label: 'Sync to Google Sheets',          requires: [] },
}

/* ------------------------------------------------------------------ */
/*  Synchronous operation executors                                   */
/* ------------------------------------------------------------------ */

async function executeComputeScores(): Promise<{
  leads_updated: number
  leads_enriched: number
}> {
  // Fetch all leads with their signals
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, is_mls_listed, bs_signals(signal_type, weight)')

  if (error || !leads) {
    throw new Error(`Failed to fetch leads: ${error?.message || 'No data'}`)
  }

  let updated = 0

  for (const lead of leads) {
    const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
    const { score, priority } = computeDistressScore(lead, signals)
    const completeness = computeCompleteness(lead as Record<string, unknown>)

    const { error: updateErr } = await supabase
      .from('bs_leads')
      .update({
        distress_score: score,
        lead_priority: priority,
        completeness,
      })
      .eq('id', lead.id)

    if (!updateErr) updated++
  }

  return { leads_updated: updated, leads_enriched: updated }
}

async function executeDetectAbsentee(): Promise<{
  leads_updated: number
}> {
  // Fetch leads that have both address and mailing_address
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('id, address, mailing_address')

  if (error || !leads) {
    throw new Error(`Failed to fetch leads: ${error?.message || 'No data'}`)
  }

  let updated = 0

  for (const lead of leads) {
    const address = (lead.address || '').toLowerCase().trim()
    const mailing = (lead.mailing_address || '').toLowerCase().trim()
    const isAbsentee = mailing.length > 0 && address.length > 0 && mailing !== address

    const { error: updateErr } = await supabase
      .from('bs_leads')
      .update({ is_absentee: isAbsentee })
      .eq('id', lead.id)

    if (!updateErr) updated++
  }

  return { leads_updated: updated }
}

async function executeExportSheets(): Promise<{
  leads_updated: number
}> {
  // Fetch top leads by distress_score for export
  const { data: leads, error } = await supabase
    .from('bs_leads')
    .select('*, bs_signals(name)')
    .gte('distress_score', 50)
    .order('distress_score', { ascending: false })
    .limit(200)

  if (error || !leads) {
    throw new Error(`Failed to fetch leads: ${error?.message || 'No data'}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exportLeads = leads.map((lead: any) => {
    const { bs_signals, ...rest } = lead
    return {
      ...rest,
      active_signals: Array.isArray(bs_signals) ? bs_signals : [],
    }
  })

  const result = await syncToGoogleSheet(exportLeads as any)
  return { leads_updated: result.rows_synced }
}

/* ------------------------------------------------------------------ */
/*  Simulated async operation helpers                                  */
/* ------------------------------------------------------------------ */

function buildInitialSteps(operationKey: string, county?: string): Array<{
  name: string
  detail: string
  status: string
  records: number
}> {
  const countyLabel = county || 'target county'

  const stepMap: Record<string, Array<{ name: string; detail: string }>> = {
    scrape_nod: [
      { name: `Connecting to ${countyLabel} Recorder`, detail: 'Establishing secure connection' },
      { name: 'Fetching NOD filings', detail: 'Querying recent Notice of Default records' },
      { name: 'Parsing results', detail: 'Extracting property and borrower data' },
    ],
    scrape_auction: [
      { name: `Connecting to ${countyLabel} Trustee Sale Calendar`, detail: 'Establishing connection' },
      { name: 'Fetching auction listings', detail: 'Querying upcoming sale dates' },
      { name: 'Matching to properties', detail: 'Cross-referencing APN records' },
    ],
    scrape_tax_delinquent: [
      { name: `Connecting to ${countyLabel} Tax Collector`, detail: 'Establishing secure connection' },
      { name: 'Fetching delinquent accounts', detail: 'Querying overdue tax records' },
      { name: 'Parsing property data', detail: 'Extracting APN, amounts, and owner info' },
    ],
    scrape_vacancy: [
      { name: `Querying USPS vacancy data for ${countyLabel}`, detail: 'Fetching vacancy indicators' },
      { name: 'Cross-referencing utility records', detail: 'Checking disconnection data' },
      { name: 'Flagging vacant properties', detail: 'Updating lead records' },
    ],
    scrape_assessor: [
      { name: `Connecting to ${countyLabel} Assessor`, detail: 'Establishing secure connection' },
      { name: 'Fetching property characteristics', detail: 'Querying assessor database' },
      { name: 'Parsing records', detail: 'Extracting beds, baths, sqft, values' },
    ],
    scrape_recorder: [
      { name: `Connecting to ${countyLabel} Recorder`, detail: 'Establishing secure connection' },
      { name: 'Fetching deed transfers', detail: 'Querying quitclaim and executor deeds' },
      { name: 'Processing documents', detail: 'Extracting grantor/grantee data' },
    ],
    scrape_lis_pendens: [
      { name: `Connecting to ${countyLabel} Court System`, detail: 'Establishing secure connection' },
      { name: 'Fetching lis pendens filings', detail: 'Querying recent court notices' },
      { name: 'Cross-referencing bankruptcy', detail: 'Checking PACER filings' },
    ],
    enrich_property: [
      { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties with missing data' },
      { name: 'Enriching property characteristics', detail: 'Filling beds, baths, sqft, year built' },
      { name: 'Validating enriched data', detail: 'Cross-checking values' },
    ],
    enrich_valuation: [
      { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties for valuation' },
      { name: 'Running comparable sales analysis', detail: 'Finding recent comps within 0.5 mi' },
      { name: 'Updating estimated values', detail: 'Computing adjusted market values' },
    ],
    enrich_owner: [
      { name: `Loading ${countyLabel} leads`, detail: 'Fetching properties missing owner data' },
      { name: 'Running skip-trace queries', detail: 'Discovering phone, email, mailing address' },
      { name: 'Validating contact data', detail: 'Verifying phone and email deliverability' },
    ],
    dedupe_leads: [
      { name: 'Scanning lead database', detail: 'Building APN index' },
      { name: 'Identifying duplicates', detail: 'Matching by APN and address' },
      { name: 'Merging records', detail: 'Preserving highest-quality data' },
    ],
    clean_stale: [
      { name: 'Scanning lead database', detail: 'Checking signal activity dates' },
      { name: 'Identifying stale records', detail: 'Finding leads with 90+ days no activity' },
      { name: 'Archiving stale leads', detail: 'Moving to archive' },
    ],
  }

  const steps = stepMap[operationKey] || [
    { name: 'Initializing', detail: 'Starting operation' },
    { name: 'Processing', detail: 'Running operation logic' },
    { name: 'Finalizing', detail: 'Saving results' },
  ]

  return steps.map((s) => ({
    ...s,
    status: 'running',
    records: 0,
  }))
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request)

    const body = await request.json()
    const { operation, params: opParams } = body as {
      operation?: string
      params?: { county?: string; days?: string }
    }

    if (!operation || !OPERATIONS[operation]) {
      return NextResponse.json(
        { error: 'Invalid operation', valid_operations: Object.keys(OPERATIONS) },
        { status: 400 }
      )
    }

    const opDef = OPERATIONS[operation]

    // Validate required params
    for (const req of opDef.requires) {
      const val = opParams?.[req as keyof typeof opParams]
      if (!val || val.trim().length === 0) {
        return NextResponse.json(
          { error: `Missing required parameter: ${req}` },
          { status: 400 }
        )
      }
    }

    const startedAt = new Date().toISOString()

    // Synchronous operations: execute immediately and return result
    const syncOps = ['compute_scores', 'detect_absentee', 'export_sheets']

    if (syncOps.includes(operation)) {
      // Create operation record
      const { data: opRecord, error: insertErr } = await supabase
        .from('bs_operations')
        .insert({
          operation_key: operation,
          label: opDef.label,
          status: 'running',
          is_active: true,
          started_at: startedAt,
          triggered_by: user.username,
          params: opParams || {},
          steps: [],
        })
        .select('id')
        .single()

      if (insertErr) {
        return NextResponse.json(
          { error: 'Failed to create operation', detail: insertErr.message },
          { status: 500 }
        )
      }

      try {
        let result: { leads_created?: number; leads_updated?: number; leads_enriched?: number }

        if (operation === 'compute_scores') {
          const r = await executeComputeScores()
          result = { leads_updated: r.leads_updated, leads_enriched: r.leads_enriched }
        } else if (operation === 'detect_absentee') {
          const r = await executeDetectAbsentee()
          result = { leads_updated: r.leads_updated }
        } else {
          const r = await executeExportSheets()
          result = { leads_updated: r.leads_updated }
        }

        const completedAt = new Date().toISOString()
        const durationSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
        )

        // Update operation as completed
        await supabase
          .from('bs_operations')
          .update({
            status: 'completed',
            is_active: false,
            completed_at: completedAt,
            duration_seconds: durationSeconds,
            leads_created: result.leads_created || 0,
            leads_updated: result.leads_updated || 0,
            leads_enriched: result.leads_enriched || 0,
            leads_failed: 0,
            steps: [
              { name: 'Execute', detail: 'Running operation', status: 'success', records: result.leads_updated || 0 },
              { name: 'Complete', detail: 'Operation finished', status: 'success', records: 0 },
            ],
          })
          .eq('id', opRecord.id)

        // Insert notification
        await supabase.from('bs_notification_events').insert({
          event_type: 'operation_completed',
          data: {
            operation_id: opRecord.id,
            operation_key: operation,
            label: opDef.label,
            status: 'completed',
            duration_seconds: durationSeconds,
            leads_updated: result.leads_updated || 0,
            leads_enriched: result.leads_enriched || 0,
          },
        })

        return NextResponse.json({
          id: opRecord.id,
          is_active: false,
          label: opDef.label,
          status: 'completed',
          duration_seconds: durationSeconds,
          leads_created: result.leads_created || 0,
          leads_updated: result.leads_updated || 0,
          leads_enriched: result.leads_enriched || 0,
        })
      } catch (execErr) {
        const errMsg = execErr instanceof Error ? execErr.message : 'Unknown error'
        const completedAt = new Date().toISOString()
        const durationSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
        )

        await supabase
          .from('bs_operations')
          .update({
            status: 'failed',
            is_active: false,
            completed_at: completedAt,
            duration_seconds: durationSeconds,
            leads_failed: 0,
            steps: [
              { name: 'Execute', detail: errMsg, status: 'failed', records: 0 },
            ],
          })
          .eq('id', opRecord.id)

        return NextResponse.json(
          { error: `Operation failed: ${errMsg}`, id: opRecord.id },
          { status: 500 }
        )
      }
    }

    // Async (simulated) operations: create record and return immediately
    const steps = buildInitialSteps(operation, opParams?.county)

    const { data: opRecord, error: insertErr } = await supabase
      .from('bs_operations')
      .insert({
        operation_key: operation,
        label: opDef.label,
        status: 'running',
        is_active: true,
        started_at: startedAt,
        triggered_by: user.username,
        params: opParams || {},
        steps,
      })
      .select('id')
      .single()

    if (insertErr) {
      return NextResponse.json(
        { error: 'Failed to create operation', detail: insertErr.message },
        { status: 500 }
      )
    }

    // Insert progress notification
    await supabase.from('bs_notification_events').insert({
      event_type: 'operation_started',
      data: {
        operation_id: opRecord.id,
        operation_key: operation,
        label: opDef.label,
        county: opParams?.county || null,
      },
    })

    return NextResponse.json({
      id: opRecord.id,
      is_active: true,
      label: opDef.label,
      status: 'running',
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
