import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 2000
const BATCH_SIZE = 1000

const MAP_FIELDS = [
  'id',
  'latitude',
  'longitude',
  'address',
  'county',
  'distress_score',
  'owner_name',
  'beds',
  'baths',
  'sqft_living',
  'estimated_value',
  'scraped_at',
].join(', ')

interface Signal {
  lead_id: string
  name: string
  signal_type: string
}

interface LeadRow {
  id: string
  latitude: number
  longitude: number
  address: string | null
  county: string | null
  distress_score: number | null
  owner_name: string | null
  beds: number | null
  baths: number | null
  sqft_living: number | null
  estimated_value: number | null
  scraped_at: string | null
  bs_signals?: Signal[]
}

function parseLimit(raw: string | null): number {
  if (!raw) return DEFAULT_LIMIT
  const parsed = parseInt(raw, 10)
  if (isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT
  return Math.min(parsed, MAX_LIMIT)
}

function collectAppliedFilters(params: URLSearchParams): Record<string, string> {
  const tracked = [
    'date_from', 'date_to', 'min_score', 'max_score',
    'county', 'signal_type', 'limit',
  ]
  const applied: Record<string, string> = {}
  for (const key of tracked) {
    const val = params.get(key)
    if (val) applied[key] = val
  }
  return applied
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams
    const limit = parseLimit(params.get('limit'))
    const signalType = params.get('signal_type')
    const dateFrom = params.get('date_from')
    const dateTo = params.get('date_to')

    // Determine the signal join: inner when filtering, left when not
    const signalJoin = signalType
      ? 'bs_signals!inner(lead_id, name, signal_type)'
      : 'bs_signals(lead_id, name, signal_type)'

    // ── Count query (parallel with data fetch) ──
    let countQuery = signalType
      ? supabase
          .from('bs_leads')
          .select('id, bs_signals!inner(signal_type)', { count: 'exact', head: true })
      : supabase
          .from('bs_leads')
          .select('id', { count: 'exact', head: true })

    countQuery = countQuery
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
    countQuery = applyFilters(countQuery, params)
    if (signalType) countQuery = countQuery.eq('bs_signals.signal_type', signalType)
    if (dateFrom) countQuery = countQuery.gte('scraped_at', dateFrom)
    if (dateTo) countQuery = countQuery.lte('scraped_at', dateTo)

    // ── Data queries: fetch in batches of 1000 up to limit ──
    const batchCount = Math.ceil(limit / BATCH_SIZE)
    const batchPromises: ReturnType<typeof supabase.from>[] = []

    for (let i = 0; i < batchCount; i++) {
      const from = i * BATCH_SIZE
      const to = Math.min(from + BATCH_SIZE, limit) - 1

      let batchQuery = supabase
        .from('bs_leads')
        .select(`${MAP_FIELDS}, ${signalJoin}`)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .range(from, to)

      batchQuery = applyFilters(batchQuery, params)
      if (signalType) batchQuery = batchQuery.eq('bs_signals.signal_type', signalType)
      if (dateFrom) batchQuery = batchQuery.gte('scraped_at', dateFrom)
      if (dateTo) batchQuery = batchQuery.lte('scraped_at', dateTo)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      batchPromises.push(batchQuery as any)
    }

    // Run count + all data batches in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [countResult, ...batchResults] = await Promise.all([countQuery, ...batchPromises] as any[])

    if (countResult.error) {
      return NextResponse.json(
        { error: 'Failed to fetch map data count', detail: countResult.error.message },
        { status: 500 }
      )
    }

    // Merge batches
    const allLeads: LeadRow[] = []
    for (const batch of batchResults) {
      if (batch.error) {
        return NextResponse.json(
          { error: 'Failed to fetch map data', detail: batch.error.message },
          { status: 500 }
        )
      }
      if (batch.data) {
        allLeads.push(...(batch.data as LeadRow[]))
      }
    }

    // ── Shape response ──
    const leads = allLeads.map((lead) => {
      const signals = Array.isArray(lead.bs_signals)
        ? lead.bs_signals.map((s: Signal) => s.name)
        : []

      return {
        id: lead.id,
        latitude: lead.latitude,
        longitude: lead.longitude,
        address: lead.address,
        county: lead.county,
        distress_score: lead.distress_score,
        signal_count: signals.length,
        signals,
        owner_name: lead.owner_name,
        beds: lead.beds,
        baths: lead.baths,
        sqft: lead.sqft_living,
        estimated_value: lead.estimated_value,
        scraped_at: lead.scraped_at,
      }
    })

    return NextResponse.json({
      leads,
      total: countResult.count ?? leads.length,
      filters_applied: collectAppliedFilters(params),
    })
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
