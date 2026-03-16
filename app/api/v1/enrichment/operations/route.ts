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
  // --- SCRAPING ---
  worker_scrape: {
    label: 'Run all scrapers',
    description: 'Runs all 9 scrapers (3 counties × assessor, recorder, tax) + GIS Santa Clara on the Python backend.',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-spider',
    tier: 1,
    estimated_time: '~20–60 min',
    requires: [],
    danger: false,
  },
  scrape_santa_clara: {
    label: 'Scrape Santa Clara',
    description: 'Runs assessor, recorder, and tax scrapers for Santa Clara County only.',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-building-columns',
    tier: 2,
    estimated_time: '~10–20 min',
    requires: [],
    danger: false,
  },
  scrape_san_mateo: {
    label: 'Scrape San Mateo',
    description: 'Runs assessor, recorder, and tax scrapers for San Mateo County only.',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-building-columns',
    tier: 2,
    estimated_time: '~10–20 min',
    requires: [],
    danger: false,
  },
  scrape_alameda: {
    label: 'Scrape Alameda',
    description: 'Runs assessor, recorder, and tax scrapers for Alameda County only.',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-building-columns',
    tier: 2,
    estimated_time: '~10–20 min',
    requires: [],
    danger: false,
  },
  // --- ENRICHMENT ---
  worker_enrichment: {
    label: 'Full Enrichment',
    description: 'Runs vacancy detection (owner ≠ address) + BatchData skip-trace (phone/email) on all contracted counties.',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-wand-magic-sparkles',
    tier: 1,
    estimated_time: '~2–5 min',
    requires: [],
    danger: false,
  },
  enrich_vacancy_only: {
    label: 'Vacancy Detection Only',
    description: 'Detects vacant properties (owner address ≠ property address). Free — no API cost.',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-house-circle-xmark',
    tier: 2,
    estimated_time: '~1–2 min',
    requires: [],
    danger: false,
  },
  enrich_skip_trace_only: {
    label: 'Skip-Trace Only',
    description: 'Enriches leads with phone/email via BatchData ($0.01/lookup). Targets leads with score ≥ 50.',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-phone-volume',
    tier: 2,
    estimated_time: '~2–5 min',
    requires: [],
    danger: false,
  },
  // --- EXPORT ---
  worker_daily_excel: {
    label: 'Generate Daily Excel',
    description: 'Generates the daily Excel export and sends via email (same as the 7 AM cron).',
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
