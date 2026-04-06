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
 * County scrapes dispatch 3 parallel requests (assessor, recorder, tax).
 */
const WORKER_ENDPOINTS: Record<EnrichmentOperationKey, { method: string; paths: string[] }> = {
  worker_scrape: { method: 'POST', paths: ['/scrape'] },
  worker_enrichment: { method: 'POST', paths: ['/enrichment?vacancy=true&skip_trace=true'] },
  worker_daily_excel: { method: 'POST', paths: ['/daily-excel'] },
  scrape_santa_clara: { method: 'POST', paths: ['/scrape/santa_clara/assessor', '/scrape/santa_clara/recorder', '/scrape/santa_clara/tax'] },
  scrape_san_mateo: { method: 'POST', paths: ['/scrape/san_mateo/assessor', '/scrape/san_mateo/recorder', '/scrape/san_mateo/tax'] },
  scrape_alameda: { method: 'POST', paths: ['/scrape/alameda/assessor', '/scrape/alameda/recorder', '/scrape/alameda/tax'] },
  enrich_vacancy_only: { method: 'POST', paths: ['/enrichment?vacancy=true&skip_trace=false'] },
  enrich_skip_trace_only: { method: 'POST', paths: ['/enrichment?vacancy=false&skip_trace=true'] },
  recompute_scores: { method: 'POST', paths: ['/recompute-scores'] },
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
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Operation-Id': opRecord.id,
    }
    const secret = process.env.WORKER_SECRET || process.env.BACKEND_SECRET || ''
    if (secret) headers['X-Worker-Secret'] = secret

    // Dispatch all paths in parallel (county scrapes have 3 sources).
    for (const path of endpoint.paths) {
      fetch(`${workerUrl}${path}`, { method: endpoint.method, headers }).catch(() => {})
    }

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
