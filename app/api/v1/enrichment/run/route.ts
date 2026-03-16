import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import {
  isWorkerConfigured,
  workerScrapeTrigger,
  workerScrapeCounty,
  workerEnrichment,
  workerEnrichCounty,
  workerDailyExcel,
  WorkerScrapeResult,
} from '@/lib/worker'
import {
  ENRICHMENT_OPERATIONS,
  EnrichmentOperationKey,
} from '@/lib/enrichment-operations'
import { computeDistressScore, computeCompleteness } from '@/lib/scoring'

/** Recompute distress_score + completeness for all leads after scraping/enrichment. */
async function recomputeAllScores(): Promise<number> {
  let updated = 0
  let offset = 0
  let hasMore = true

  while (hasMore) {
    const { data: leads } = await supabase
      .from('bs_leads')
      .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, is_mls_listed, address, city, county, zip_code, apn, latitude, longitude, property_type, beds, baths, sqft_living, last_sale_price, owner_name, owner_phone, owner_email, mailing_address, wildfire_risk, flood_zone')
      .range(offset, offset + 499)

    if (!leads || leads.length === 0) { hasMore = false; break }

    const leadIds = leads.map((l) => l.id)
    const { data: allSignals } = await supabase
      .from('bs_signals')
      .select('lead_id, signal_type, weight')
      .in('lead_id', leadIds)

    const signalsByLead: Record<number, { signal_type: string; weight: number }[]> = {}
    for (const s of allSignals || []) {
      const lid = s.lead_id as number
      if (!signalsByLead[lid]) signalsByLead[lid] = []
      signalsByLead[lid].push({ signal_type: s.signal_type, weight: s.weight })
    }

    for (const lead of leads) {
      const signals = signalsByLead[lead.id as number] || []
      const { score, priority } = computeDistressScore(lead, signals)
      const completeness = computeCompleteness(lead as Record<string, unknown>)
      const { error } = await supabase
        .from('bs_leads')
        .update({ distress_score: score, lead_priority: priority, completeness, updated_at: new Date().toISOString() })
        .eq('id', lead.id)
      if (!error) updated++
    }

    offset += 500
    if (leads.length < 500) hasMore = false
  }
  return updated
}

/** Only real operations — executed on the Python backend. No fake data. */
const OPERATIONS: Record<
  EnrichmentOperationKey,
  { label: string; requires: string[] }
> = Object.fromEntries(
  Object.entries(ENRICHMENT_OPERATIONS).map(([key, meta]) => [
    key,
    { label: meta.label, requires: meta.requires },
  ])
) as Record<EnrichmentOperationKey, { label: string; requires: string[] }>

async function runCountyScrape(county: string): Promise<{
  leads_created?: number
  leads_updated?: number
  leads_enriched?: number
}> {
  const sources = ['assessor', 'recorder', 'tax'] as const
  let totalLeads = 0
  let totalSignals = 0

  for (const source of sources) {
    const r = await workerScrapeCounty(county, source)
    if (!r.ok) throw new Error(r.error || `Scrape ${county}/${source} failed`)

    const data: WorkerScrapeResult | undefined = r.data
    if (data) {
      if (typeof data.leads_found === 'number') totalLeads += data.leads_found
      if (typeof data.signals_added === 'number') totalSignals += data.signals_added
    }
  }

  // Expose leads_found as "updated" to the UI — this is the most
  // intuitive metric for the Trigger Center without changing its schema.
  const leads_updated = totalLeads || sources.length
  const leads_enriched = totalSignals || 0

  return { leads_updated, leads_enriched }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAdmin(request)

    if (!isWorkerConfigured()) {
      return NextResponse.json(
        { error: 'SCRAPER_WORKER_URL not set. Configure the Python backend URL.' },
        { status: 503 }
      )
    }

    const body = await request.json()
    const { operation, params: opParams } = body as {
      operation?: EnrichmentOperationKey
      params?: Record<string, string>
    }

    if (!operation || !(operation in OPERATIONS)) {
      return NextResponse.json(
        { error: 'Invalid operation', valid_operations: Object.keys(OPERATIONS) },
        { status: 400 }
      )
    }

    const opDef = OPERATIONS[operation]
    for (const req of opDef.requires) {
      const val = opParams?.[req]
      if (!val || String(val).trim().length === 0) {
        return NextResponse.json(
          { error: `Missing required parameter: ${req}` },
          { status: 400 }
        )
      }
    }

    const startedAt = new Date().toISOString()

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
      type Result = { leads_created?: number; leads_updated?: number; leads_enriched?: number }

      const handlers: Partial<Record<EnrichmentOperationKey, () => Promise<Result>>> = {
        worker_scrape: async () => {
          workerScrapeTrigger()
          return { leads_updated: 0 }
        },
        worker_enrichment: async () => {
          const r = await workerEnrichment()
          if (r.status === 'error') throw new Error(r.error || 'Worker enrichment failed')
          const st = r.results?.skip_trace as { enriched?: number } | undefined
          return { leads_enriched: st?.enriched ?? 0 }
        },
        worker_daily_excel: async () => {
          const r = await workerDailyExcel()
          if (r.error) throw new Error(r.error)
          return { leads_updated: r.leads_count ?? 0 }
        },
        scrape_santa_clara: () => runCountyScrape('Santa Clara'),
        scrape_san_mateo: () => runCountyScrape('San Mateo'),
        scrape_alameda: () => runCountyScrape('Alameda'),
        enrich_vacancy_only: async () => {
          const r = await workerEnrichCounty('all', true, false)
          if (!r.ok) throw new Error(r.error || 'Vacancy enrichment failed')
          return { leads_enriched: 0 }
        },
        enrich_skip_trace_only: async () => {
          const r = await workerEnrichCounty('all', false, true)
          if (!r.ok) throw new Error(r.error || 'Skip-trace enrichment failed')
          return { leads_enriched: 0 }
        },
        recompute_scores: async () => {
          const scored = await recomputeAllScores()
          return { leads_enriched: scored }
        },
      }

      const handler = handlers[operation]
      const result: Result = handler ? await handler() : {}

      const completedAt = new Date().toISOString()
      const durationSeconds = Math.round(
        (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
      )

      // Recompute distress scores after any scrape/enrichment operation
      const scored = await recomputeAllScores()

      await supabase
        .from('bs_operations')
        .update({
          status: 'completed',
          is_active: false,
          completed_at: completedAt,
          duration_seconds: durationSeconds,
          leads_created: result.leads_created ?? 0,
          leads_updated: result.leads_updated ?? 0,
          leads_enriched: (result.leads_enriched ?? 0) + scored,
          leads_failed: 0,
          steps: [
            { name: 'Execute', detail: 'Backend completed', status: 'success', records: result.leads_updated ?? 0 },
            { name: 'Scoring', detail: `Recomputed ${scored} lead scores`, status: 'success', records: scored },
            { name: 'Complete', detail: 'Operation finished', status: 'success', records: 0 },
          ],
        })
        .eq('id', opRecord.id)

      await supabase.from('bs_notification_events').insert({
        event_type: 'operation_completed',
        data: {
          operation_id: opRecord.id,
          operation_key: operation,
          label: opDef.label,
          status: 'completed',
          duration_seconds: durationSeconds,
          leads_updated: result.leads_updated ?? 0,
          leads_enriched: result.leads_enriched ?? 0,
        },
      })

      return NextResponse.json({
        id: opRecord.id,
        is_active: false,
        label: opDef.label,
        status: 'completed',
        duration_seconds: durationSeconds,
        leads_created: result.leads_created ?? 0,
        leads_updated: result.leads_updated ?? 0,
        leads_enriched: result.leads_enriched ?? 0,
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
          steps: [{ name: 'Execute', detail: errMsg, status: 'failed', records: 0 }],
        })
        .eq('id', opRecord.id)

      return NextResponse.json(
        { error: `Operation failed: ${errMsg}`, id: opRecord.id },
        { status: 500 }
      )
    }
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
