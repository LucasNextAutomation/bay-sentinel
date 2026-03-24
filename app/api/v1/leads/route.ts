import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

const PAGE_SIZE = 50

const LIST_FIELDS = [
  'id',
  'distress_score',
  'address',
  'county',
  'estimated_value',
  'assessed_value',
  'owner_name',
  'lead_priority',
].join(', ')

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams
    const page = Math.max(1, parseInt(params.get('page') || '1', 10))
    const from = (page - 1) * PAGE_SIZE
    const to = from + PAGE_SIZE - 1
    const signalType = params.get('signal_type')

    // When filtering by signal_type, use inner join to only return leads with that signal
    const signalJoin = signalType
      ? 'bs_signals!inner(name, weight, signal_type)'
      : 'bs_signals(name, weight, signal_type)'

    // Get total count with filters applied
    let countQuery = signalType
      ? supabase.from('bs_leads').select('id, bs_signals!inner(signal_type)', { count: 'exact', head: true })
      : supabase.from('bs_leads').select('id', { count: 'exact', head: true })

    countQuery = applyFilters(countQuery, params)
    if (signalType) countQuery = countQuery.eq('bs_signals.signal_type', signalType)
    const { count, error: countError } = await countQuery

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to fetch lead count', detail: countError.message },
        { status: 500 }
      )
    }

    // Get paginated leads with signals join
    let dataQuery = supabase
      .from('bs_leads')
      .select(`${LIST_FIELDS}, ${signalJoin}`)
      .range(from, to)

    dataQuery = applyFilters(dataQuery, params)
    if (signalType) dataQuery = dataQuery.eq('bs_signals.signal_type', signalType)
    const { data, error } = await dataQuery

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch leads', detail: error.message },
        { status: 500 }
      )
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results = (data || []).map((lead: any) => {
      const { bs_signals, ...rest } = lead
      return {
        ...rest,
        active_signals: Array.isArray(bs_signals) ? bs_signals : [],
      }
    })

    return NextResponse.json({ count: count || 0, results })
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
