import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { computeDistressScore, computeCompleteness } from '@/lib/scoring'
import { exportToGoogleSheets } from '@/lib/google-sheets'
import { runOperation } from '@/lib/scrapers/runner'

/* ------------------------------------------------------------------ */
/*  Operation definitions                                              */
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
/*  Synchronous operation executors                                    */
/* ------------------------------------------------------------------ */

async function executeComputeScores(): Promise<{
  leads_updated: number
  leads_enriched: number
}> {
  // Paginate to overcome Supabase 1000-row default limit
  const allLeads: Record<string, unknown>[] = []
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data: batch, error } = await supabase
      .from('bs_leads')
      .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, bs_signals(signal_type, weight)')
      .range(offset, offset + 999)

    if (error) throw new Error(`Failed to fetch leads: ${error.message}`)
    if (!batch || batch.length === 0) break
    allLeads.push(...batch)
  }

  let updated = 0
  const BATCH_SIZE = 50

  for (let i = 0; i < allLeads.length; i += BATCH_SIZE) {
    const batch = allLeads.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map((lead) => {
        const signals = Array.isArray(lead.bs_signals) ? lead.bs_signals : []
        const { score, priority } = computeDistressScore(lead, signals)
        const completeness = computeCompleteness(lead as Record<string, unknown>)
        return supabase
          .from('bs_leads')
          .update({ distress_score: score, lead_priority: priority, completeness })
          .eq('id', lead.id)
      })
    )
    updated += results.filter((r) => !r.error).length
  }

  return { leads_updated: updated, leads_enriched: updated }
}

async function executeDetectAbsentee(): Promise<{
  leads_updated: number
}> {
  // Paginate to overcome Supabase 1000-row default limit
  const leads: { id: string; address: string; mailing_address: string | null }[] = []
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data: batch, error: bErr } = await supabase
      .from('bs_leads')
      .select('id, address, mailing_address')
      .range(offset, offset + 999)

    if (bErr) throw new Error(`Failed to fetch leads: ${bErr.message}`)
    if (!batch || batch.length === 0) break
    leads.push(...batch)
  }

  const absenteeIds: string[] = []
  const nonAbsenteeIds: string[] = []

  for (const lead of leads) {
    const address = (lead.address || '').toLowerCase().trim()
    const mailing = (lead.mailing_address || '').toLowerCase().trim()
    if (mailing.length > 0 && address.length > 0 && mailing !== address) {
      absenteeIds.push(lead.id)
    } else {
      nonAbsenteeIds.push(lead.id)
    }
  }

  let updated = 0
  const BATCH_SIZE = 200

  for (let i = 0; i < absenteeIds.length; i += BATCH_SIZE) {
    const batch = absenteeIds.slice(i, i + BATCH_SIZE)
    const { error: err } = await supabase
      .from('bs_leads')
      .update({ is_absentee: true })
      .in('id', batch)
    if (!err) updated += batch.length
  }

  for (let i = 0; i < nonAbsenteeIds.length; i += BATCH_SIZE) {
    const batch = nonAbsenteeIds.slice(i, i + BATCH_SIZE)
    const { error: err } = await supabase
      .from('bs_leads')
      .update({ is_absentee: false })
      .in('id', batch)
    if (!err) updated += batch.length
  }

  return { leads_updated: updated }
}

async function executeExportSheets(): Promise<{
  leads_updated: number
  sheet_url: string
}> {
  try {
    const result = await exportToGoogleSheets(50)
    return { leads_updated: result.rows_synced, sheet_url: result.sheet_url }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google Sheets export failed'
    throw new Error(message)
  }
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
        let result: { leads_created?: number; leads_updated?: number; leads_enriched?: number; sheet_url?: string }

        if (operation === 'compute_scores') {
          const r = await executeComputeScores()
          result = { leads_updated: r.leads_updated, leads_enriched: r.leads_enriched }
        } else if (operation === 'detect_absentee') {
          const r = await executeDetectAbsentee()
          result = { leads_updated: r.leads_updated }
        } else {
          const r = await executeExportSheets()
          result = { leads_updated: r.leads_updated, sheet_url: r.sheet_url }
        }

        const completedAt = new Date().toISOString()
        const durationSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
        )

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
            ...(result.sheet_url ? { sheet_url: result.sheet_url } : {}),
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
          ...(result.sheet_url ? { sheet_url: result.sheet_url } : {}),
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

    // Async operations: create record and run REAL scrapers in background
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
        steps: [
          { name: 'Initializing', detail: 'Starting operation...', status: 'running', records: 0 },
        ],
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

    // Run REAL scraper in the background using Next.js after()
    after(async () => {
      await runOperation(opRecord.id, operation, opDef.label, startedAt, opParams || {})
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
