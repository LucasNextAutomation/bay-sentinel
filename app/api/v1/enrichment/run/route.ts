import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { isWorkerConfigured } from '@/lib/worker'
import {
  ENRICHMENT_OPERATIONS,
  EnrichmentOperationKey,
} from '@/lib/enrichment-operations'

const OPERATIONS: Record<
  EnrichmentOperationKey,
  { label: string; requires: string[] }
> = Object.fromEntries(
  Object.entries(ENRICHMENT_OPERATIONS).map(([key, meta]) => [
    key,
    { label: meta.label, requires: meta.requires },
  ])
) as Record<EnrichmentOperationKey, { label: string; requires: string[] }>

/**
 * Map operation keys to Railway worker endpoints.
 * ALL operations are fire-and-forget — Vercel returns immediately with the
 * operation ID while Railway processes in the background.
 */
const WORKER_ENDPOINTS: Record<EnrichmentOperationKey, { method: string; path: string }> = {
  worker_scrape: { method: 'POST', path: '/scrape' },
  worker_enrichment: { method: 'POST', path: '/enrichment?vacancy=true&skip_trace=true' },
  worker_daily_excel: { method: 'POST', path: '/daily-excel' },
  scrape_santa_clara: { method: 'POST', path: '/scrape/Santa%20Clara/all' },
  scrape_san_mateo: { method: 'POST', path: '/scrape/San%20Mateo/all' },
  scrape_alameda: { method: 'POST', path: '/scrape/Alameda/all' },
  enrich_vacancy_only: { method: 'POST', path: '/enrichment?vacancy=true&skip_trace=false' },
  enrich_skip_trace_only: { method: 'POST', path: '/enrichment?vacancy=false&skip_trace=true' },
  recompute_scores: { method: 'POST', path: '/recompute-scores' },
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
        steps: [{ name: 'Dispatch', detail: 'Sent to backend worker', status: 'success', records: 0 }],
      })
      .select('id')
      .single()

    if (insertErr) {
      return NextResponse.json(
        { error: 'Failed to create operation', detail: insertErr.message },
        { status: 500 }
      )
    }

    // Fire-and-forget: dispatch to Railway worker, don't wait for completion.
    // Vercel serverless has a 10-60s timeout, but scrapes/enrichment take minutes.
    const workerUrl = (process.env.SCRAPER_WORKER_URL || '').replace(/\/$/, '')
    const endpoint = WORKER_ENDPOINTS[operation]
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const secret = process.env.WORKER_SECRET || process.env.BACKEND_SECRET || ''
    if (secret) headers['X-Worker-Secret'] = secret

    // Dispatch — don't await. The worker runs independently.
    fetch(`${workerUrl}${endpoint.path}`, {
      method: endpoint.method,
      headers,
    }).then(async (res) => {
      // Best-effort: update operation status when worker responds.
      // If Vercel kills this before it completes, the operation stays "running"
      // and will be cleaned up by the stale operation check.
      try {
        const data = await res.json().catch(() => ({}))
        const completedAt = new Date().toISOString()
        const durationSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
        )
        const status = res.ok ? 'completed' : 'failed'
        const detail = res.ok
          ? `Backend completed (${durationSeconds}s)`
          : (data?.detail || data?.error || `HTTP ${res.status}`)

        await supabase
          .from('bs_operations')
          .update({
            status,
            is_active: false,
            completed_at: completedAt,
            duration_seconds: durationSeconds,
            leads_created: data?.leads_created ?? 0,
            leads_updated: data?.leads_updated ?? data?.leads_count ?? 0,
            leads_enriched: data?.leads_enriched ?? data?.updated ?? 0,
            steps: [
              { name: 'Dispatch', detail: 'Sent to backend worker', status: 'success', records: 0 },
              { name: 'Execute', detail, status, records: data?.leads_updated ?? 0 },
            ],
          })
          .eq('id', opRecord.id)
      } catch {
        // Silently fail — Vercel may have already killed the function
      }
    }).catch(() => {
      // Network error dispatching — mark as failed
      supabase
        .from('bs_operations')
        .update({
          status: 'failed',
          is_active: false,
          completed_at: new Date().toISOString(),
          steps: [{ name: 'Dispatch', detail: 'Failed to reach backend worker', status: 'failed', records: 0 }],
        })
        .eq('id', opRecord.id)
        .then(() => {})
    })

    // Return immediately — operation is dispatched
    return NextResponse.json({
      id: opRecord.id,
      is_active: true,
      label: opDef.label,
      status: 'running',
      message: `${opDef.label} dispatched to backend. Check operation history for results.`,
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
