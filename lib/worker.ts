/**
 * Python scraper worker (Railway) — proxy for trigger actions.
 * Set SCRAPER_WORKER_URL to e.g. https://bay-sentinel-scrapers-production.up.railway.app
 */
const WORKER_URL = (process.env.SCRAPER_WORKER_URL || '').replace(/\/$/, '')

export function isWorkerConfigured(): boolean {
  return WORKER_URL.length > 0
}

export async function workerHealth(): Promise<{ ok: boolean; status?: string; error?: string }> {
  if (!WORKER_URL) return { ok: false, error: 'SCRAPER_WORKER_URL not set' }
  try {
    const res = await fetch(`${WORKER_URL}/health`, { method: 'GET', signal: AbortSignal.timeout(8000) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, status: data?.status }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unreachable' }
  }
}

/** Fire-and-forget: triggers scrape on worker (runs 20–60 min). Does not wait. */
export function workerScrapeTrigger(): void {
  if (!WORKER_URL) return
  fetch(`${WORKER_URL}/scrape`, { method: 'POST', headers: { 'Content-Type': 'application/json' } }).catch(() => {})
}

export async function workerScrape(): Promise<{ status: string; scrapers?: Record<string, unknown>; error?: string }> {
  if (!WORKER_URL) return { status: 'error', error: 'SCRAPER_WORKER_URL not set' }
  try {
    const res = await fetch(`${WORKER_URL}/scrape`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', error: data?.detail || `HTTP ${res.status}` }
    return { status: data?.status ?? 'ok', scrapers: data?.scrapers }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Request failed' }
  }
}

export async function workerEnrichment(): Promise<{
  status: string
  results?: { vacancy?: unknown; skip_trace?: unknown }
  error?: string
}> {
  if (!WORKER_URL) return { status: 'error', error: 'SCRAPER_WORKER_URL not set' }
  try {
    const res = await fetch(`${WORKER_URL}/enrichment?vacancy=true&skip_trace=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(120_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', error: data?.detail || `HTTP ${res.status}` }
    return { status: data?.status ?? 'ok', results: data?.results }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Request failed' }
  }
}

export async function workerDailyExcel(): Promise<{
  status?: string
  leads_count?: number
  excel_size_bytes?: number
  error?: string
}> {
  if (!WORKER_URL) return { error: 'SCRAPER_WORKER_URL not set' }
  try {
    const res = await fetch(`${WORKER_URL}/daily-excel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(90_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { error: data?.detail || `HTTP ${res.status}` }
    return {
      status: data?.status ?? 'ok',
      leads_count: data?.leads_count,
      excel_size_bytes: data?.excel_size_bytes,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Request failed' }
  }
}
