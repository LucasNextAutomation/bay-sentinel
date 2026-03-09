import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

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
  scrape_nod: {
    label: 'Scrape NOD Records',
    description: 'Scrapes Notice of Default records from county recorder offices',
    category: 'ingest',
    color: 'red',
    icon: 'fa-gavel',
    tier: 1,
    estimated_time: '~3 min',
    requires: ['county', 'days'],
    danger: false,
  },
  scrape_auction: {
    label: 'Scrape Auction Listings',
    description: 'Fetches upcoming foreclosure auction listings from trustee sale calendars',
    category: 'ingest',
    color: 'amber',
    icon: 'fa-hammer',
    tier: 1,
    estimated_time: '~2 min',
    requires: ['county'],
    danger: false,
  },
  scrape_tax_delinquent: {
    label: 'Scrape Tax Delinquent Properties',
    description: 'Identifies properties with delinquent taxes from county tax collector records',
    category: 'ingest',
    color: 'red',
    icon: 'fa-file-invoice-dollar',
    tier: 1,
    estimated_time: '~5 min',
    requires: ['county'],
    danger: false,
  },
  scrape_vacancy: {
    label: 'Detect Vacant Properties',
    description: 'Analyzes USPS vacancy indicators and cross-references utility data',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-house-chimney-crack',
    tier: 2,
    estimated_time: '~4 min',
    requires: ['county'],
    danger: false,
  },
  scrape_assessor: {
    label: 'Scrape County Assessor Records',
    description: 'Fetches property characteristics, assessed values, and ownership from county assessor databases',
    category: 'ingest',
    color: 'blue',
    icon: 'fa-building-columns',
    tier: 1,
    estimated_time: '~8 min',
    requires: ['county', 'days'],
    danger: false,
  },
  scrape_recorder: {
    label: 'Scrape Recorder Documents',
    description: 'Fetches deed transfers, quitclaim deeds, executor deeds, and recorded liens',
    category: 'ingest',
    color: 'cyan',
    icon: 'fa-file-contract',
    tier: 1,
    estimated_time: '~6 min',
    requires: ['county', 'days'],
    danger: false,
  },
  scrape_lis_pendens: {
    label: 'Scrape Lis Pendens & Bankruptcy',
    description: 'Monitors court filings for lis pendens notices and bankruptcy filings',
    category: 'ingest',
    color: 'rose',
    icon: 'fa-scale-balanced',
    tier: 2,
    estimated_time: '~4 min',
    requires: ['county', 'days'],
    danger: false,
  },
  enrich_property: {
    label: 'Enrich Property Data',
    description: 'Fills in missing property characteristics — beds, baths, sqft, lot size, year built',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-wand-magic-sparkles',
    tier: 2,
    estimated_time: '~10 min',
    requires: ['county'],
    danger: false,
  },
  enrich_valuation: {
    label: 'Update Valuations',
    description: 'Refreshes estimated market values using comparable sales analysis',
    category: 'enrich',
    color: 'emerald',
    icon: 'fa-chart-line',
    tier: 2,
    estimated_time: '~5 min',
    requires: ['county'],
    danger: false,
  },
  compute_scores: {
    label: 'Recompute Distress Scores',
    description: 'Recalculates AI motivation scores based on all active signals and property criteria',
    category: 'enrich',
    color: 'purple',
    icon: 'fa-brain',
    tier: 1,
    estimated_time: '~2 min',
    requires: [],
    danger: false,
  },
  enrich_owner: {
    label: 'Skip-Trace Owner Data',
    description: 'Discovers owner contact information — phone, email, mailing address via skip-tracing services',
    category: 'owner',
    color: 'purple',
    icon: 'fa-magnifying-glass',
    tier: 2,
    estimated_time: '~15 min',
    requires: ['county'],
    danger: false,
  },
  detect_absentee: {
    label: 'Detect Absentee Owners',
    description: 'Flags properties where owner mailing address differs from property address',
    category: 'owner',
    color: 'purple',
    icon: 'fa-person-walking-arrow-right',
    tier: 1,
    estimated_time: '~3 min',
    requires: [],
    danger: false,
  },
  dedupe_leads: {
    label: 'Deduplicate Leads',
    description: 'Identifies and merges duplicate property records by APN matching',
    category: 'maintain',
    color: 'amber',
    icon: 'fa-broom',
    tier: 3,
    estimated_time: '~5 min',
    requires: [],
    danger: true,
  },
  clean_stale: {
    label: 'Clean Stale Records',
    description: 'Archives leads with no signal activity in 90+ days',
    category: 'maintain',
    color: 'amber',
    icon: 'fa-trash-can',
    tier: 3,
    estimated_time: '~2 min',
    requires: [],
    danger: true,
  },
  export_sheets: {
    label: 'Sync to Google Sheets',
    description: 'Exports latest high-score leads to connected Google Sheet with full enrichment data',
    category: 'maintain',
    color: 'cyan',
    icon: 'fa-table',
    tier: 1,
    estimated_time: '~1 min',
    requires: [],
    danger: false,
  },
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)

    return NextResponse.json(OPERATIONS)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
