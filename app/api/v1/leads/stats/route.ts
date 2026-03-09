import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams
    const signalType = params.get('signal_type')

    // Helper: when signal_type filter is active, use inner join to restrict to matching leads
    function withSignalFilter(q: ReturnType<typeof supabase.from>, selectStr: string, opts: { count: 'exact'; head: true }) {
      if (signalType) {
        const joinedSelect = `${selectStr}, bs_signals!inner(signal_type)`
        let built = q.select(joinedSelect, opts)
        built = built.eq('bs_signals.signal_type', signalType)
        return built
      }
      return q.select(selectStr, opts)
    }

    // Run all count queries in parallel instead of sequential N+1
    let totalQuery = withSignalFilter(supabase.from('bs_leads'), 'id', { count: 'exact', head: true })
    totalQuery = applyFilters(totalQuery, params)

    let hotQuery = withSignalFilter(supabase.from('bs_leads'), 'id', { count: 'exact', head: true })
    hotQuery = hotQuery.gte('distress_score', 80)
    hotQuery = applyFilters(hotQuery, params)

    let warmQuery = withSignalFilter(supabase.from('bs_leads'), 'id', { count: 'exact', head: true })
    warmQuery = warmQuery.gte('distress_score', 50)
    warmQuery = applyFilters(warmQuery, params)

    // Count leads that have at least one signal using inner join
    let signalQuery = supabase
      .from('bs_leads')
      .select('id, bs_signals!inner(lead_id)', { count: 'exact', head: true })
    if (signalType) signalQuery = signalQuery.eq('bs_signals.signal_type', signalType)
    signalQuery = applyFilters(signalQuery, params)

    // Run all 4 counts in parallel
    const [totalResult, hotResult, warmResult, signalResult] = await Promise.all([
      totalQuery,
      hotQuery,
      warmQuery,
      signalQuery,
    ])

    if (totalResult.error) {
      return NextResponse.json(
        { error: 'Failed to fetch stats' },
        { status: 500 }
      )
    }

    // Average completeness — single batch (for 1800 leads, one query is enough)
    let avgCompleteness = 0
    const completenessData: { completeness: number | null }[] = []
    for (let offset = 0; offset < 10000; offset += 1000) {
      let batchQuery = supabase
        .from('bs_leads')
        .select('completeness')
        .range(offset, offset + 999)
      batchQuery = applyFilters(batchQuery, params)
      const { data: batch } = await batchQuery
      if (!batch || batch.length === 0) break
      completenessData.push(...batch)
    }

    if (completenessData.length > 0) {
      const sum = completenessData.reduce(
        (acc: number, row: { completeness: number | null }) =>
          acc + (row.completeness || 0),
        0
      )
      avgCompleteness = parseFloat((sum / completenessData.length).toFixed(2))
    }

    return NextResponse.json({
      total: totalResult.count || 0,
      hot_count: hotResult.count || 0,
      warm_count: warmResult.count || 0,
      with_signals: signalResult.count || 0,
      avg_completeness: avgCompleteness,
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
