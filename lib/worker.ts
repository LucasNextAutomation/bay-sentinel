/**
 * Python scraper worker (Railway) — proxy for trigger actions.
 * Set SCRAPER_WORKER_URL to e.g. https://bay-sentinel-scrapers-production.up.railway.app
 */
const WORKER_URL = (process.env.SCRAPER_WORKER_URL || '').replace(/\/$/, '')
const WORKER_SECRET = process.env.WORKER_SECRET || process.env.BACKEND_SECRET || ''

export function isWorkerConfigured(): boolean {
  return WORKER_URL.length > 0
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...extra }
  if (WORKER_SECRET) h['X-Worker-Secret'] = WORKER_SECRET
  return h
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
  fetch(`${WORKER_URL}/scrape`, { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }) }).catch(() => {})
}

export async function workerScrape(): Promise<{ status: string; scrapers?: Record<string, unknown>; error?: string }> {
  if (!WORKER_URL) return { status: 'error', error: 'SCRAPER_WORKER_URL not set' }
  try {
    const res = await fetch(`${WORKER_URL}/scrape`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
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
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      signal: AbortSignal.timeout(120_000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { status: 'error', error: data?.detail || `HTTP ${res.status}` }
    return { status: data?.status ?? 'ok', results: data?.results }
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : 'Request failed' }
  }
}

/** Response shape for a single scraper run. Matches FastAPI /scrape/{county}/{source}. */
export type WorkerScrapeResult = {
  status?: string
  leads_found?: number
  signals_added?: number
  [key: string]: unknown
}

/** Scrape a single county + source (e.g. assessor, recorder, tax). */
export async function workerScrapeCounty(
  county: string,
  source: string
): Promise<{ ok: boolean; data?: WorkerScrapeResult; error?: string }> {
  if (!isWorkerConfigured()) return { ok: false, error: 'Worker not configured' }
  try {
    const r = await fetch(
      `${WORKER_URL}/scrape/${encodeURIComponent(county)}/${encodeURIComponent(
        source
      )}`,
      {
        method: 'POST',
        headers: authHeaders(),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!r.ok) {
      // Surface both HTTP status and a short body snippet for easier debugging.
      let detail: string | undefined
      try {
        const body = await r.json()
        detail = body?.detail || body?.error
      } catch {
        // ignore JSON parse issues
      }
      const msg = detail ? `Worker returned ${r.status}: ${detail}` : `Worker returned ${r.status}`
      console.error('[workerScrapeCounty] error', { county, source, status: r.status, detail })
      return { ok: false, error: msg }
    }
    const data = (await r.json().catch(() => ({}))) as WorkerScrapeResult
    return { ok: true, data }
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Unknown error'
    console.error('[workerScrapeCounty] request failed', { county, source, error })
    return { ok: false, error }
  }
}

/** Run enrichment for a county with selective vacancy/skip-trace flags. */
export async function workerEnrichCounty(county: string, vacancy: boolean = true, skipTrace: boolean = true): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  if (!isWorkerConfigured()) return { ok: false, error: 'Worker not configured' }
  try {
    const params = new URLSearchParams({
      vacancy: String(vacancy),
      skip_trace: String(skipTrace),
    })
    const r = await fetch(`${WORKER_URL}/enrichment?${params}`, {
      method: 'POST',
      headers: authHeaders(),
      signal: AbortSignal.timeout(120000),
    })
    if (!r.ok) return { ok: false, error: `Worker returned ${r.status}` }
    return { ok: true, data: await r.json() }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Unknown error' }
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
      headers: authHeaders({ 'Content-Type': 'application/json' }),
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
