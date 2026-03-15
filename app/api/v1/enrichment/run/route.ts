import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import {
  isWorkerConfigured,
  workerScrapeTrigger,
  workerEnrichment,
  workerDailyExcel,
} from '@/lib/worker'

/** Only real operations — executed on the Python backend. No fake data. */
const OPERATIONS: Record<string, { label: string; requires: string[] }> = {
  worker_scrape:     { label: 'Run all scrapers', requires: [] },
  worker_enrichment: { label: 'Vacancy + Skip-trace', requires: [] },
  worker_daily_excel:{ label: 'Generate daily Excel', requires: [] },
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
      operation?: string
      params?: Record<string, string>
    }

    if (!operation || !OPERATIONS[operation]) {
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
      let result: { leads_created?: number; leads_updated?: number; leads_enriched?: number }

      if (operation === 'worker_scrape') {
        workerScrapeTrigger()
        result = { leads_updated: 0 }
      } else if (operation === 'worker_enrichment') {
        const r = await workerEnrichment()
        if (r.status === 'error') throw new Error(r.error || 'Worker enrichment failed')
        const st = r.results?.skip_trace as { enriched?: number } | undefined
        result = { leads_enriched: st?.enriched ?? 0 }
      } else if (operation === 'worker_daily_excel') {
        const r = await workerDailyExcel()
        if (r.error) throw new Error(r.error)
        result = { leads_updated: r.leads_count ?? 0 }
      } else {
        result = {}
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
          leads_created: result.leads_created ?? 0,
          leads_updated: result.leads_updated ?? 0,
          leads_enriched: result.leads_enriched ?? 0,
          leads_failed: 0,
          steps: [
            { name: 'Execute', detail: 'Backend completed', status: 'success', records: result.leads_updated ?? 0 },
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
