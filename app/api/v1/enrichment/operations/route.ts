import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { isWorkerConfigured } from '@/lib/worker'

/** Only real operations — executed on the Python backend (Railway). No fake/scrap data. */
const OPERATIONS: Record<string, {
  label: string
  description: string
  category: string
  color: string
  icon: string
  tier: number
  estimated_time: string
  requires: string[]
  danger: boolean
}> = {
  worker_scrape: {
    label: 'Run all scrapers',
    description: 'Runs all 9 county scrapers + GIS Santa Clara (assessor, recorder, tax) on the Python backend.',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-spider',
    tier: 1,
    estimated_time: '~20–60 min',
    requires: [],
    danger: false,
  },
  worker_enrichment: {
    label: 'Vacancy + Skip-trace',
    description: 'Runs vacancy detection (owner ≠ address) and BatchData skip-trace (phone/email) on the backend.',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-wand-magic-sparkles',
    tier: 1,
    estimated_time: '~2–5 min',
    requires: [],
    danger: false,
  },
  worker_daily_excel: {
    label: 'Generate daily Excel',
    description: 'Generates the daily Excel export on the backend (same as the 7am cron).',
    category: 'maintain',
    color: 'cyan',
    icon: 'fa-file-excel',
    tier: 1,
    estimated_time: '~1 min',
    requires: [],
    danger: false,
  },
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)
    if (!isWorkerConfigured()) {
      return NextResponse.json({})
    }
    return NextResponse.json(OPERATIONS)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
