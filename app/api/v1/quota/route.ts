import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const WORKER_URL = (process.env.SCRAPER_WORKER_URL || '').replace(/\/$/, '')
const WORKER_SECRET = process.env.WORKER_SECRET || ''

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    if (!WORKER_URL) {
      return NextResponse.json(
        { error: 'Scraper worker not configured' },
        { status: 503 }
      )
    }

    const headers: Record<string, string> = {}
    if (WORKER_SECRET) {
      headers['X-Worker-Secret'] = WORKER_SECRET
    }

    const resp = await fetch(`${WORKER_URL}/quota`, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(15_000),
    })

    const data = await resp.json()

    if (!resp.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || `Worker returned ${resp.status}` },
        { status: resp.status }
      )
    }

    return NextResponse.json(data)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    const msg = thrown instanceof Error ? thrown.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
