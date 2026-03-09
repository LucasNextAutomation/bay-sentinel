import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams

    // Total count
    let totalQuery = supabase
      .from('bs_leads')
      .select('id', { count: 'exact', head: true })
    totalQuery = applyFilters(totalQuery, params)
    const { count: total, error: totalError } = await totalQuery

    if (totalError) {
      return NextResponse.json(
        { error: 'Failed to fetch stats', detail: totalError.message },
        { status: 500 }
      )
    }

    // Hot count (distress_score >= 80)
    let hotQuery = supabase
      .from('bs_leads')
      .select('id', { count: 'exact', head: true })
      .gte('distress_score', 80)
    hotQuery = applyFilters(hotQuery, params)
    const { count: hot_count } = await hotQuery

    // Warm count (distress_score >= 50)
    let warmQuery = supabase
      .from('bs_leads')
      .select('id', { count: 'exact', head: true })
      .gte('distress_score', 50)
    warmQuery = applyFilters(warmQuery, params)
    const { count: warm_count } = await warmQuery

    // With signals: count distinct lead_ids from signals table that match filtered leads
    // Use a separate approach: get lead_ids from signals, then count matching leads
    // Batch fetch signals to overcome 1000-row limit
    const allSignalLeads: { lead_id: number }[] = []
    for (let offset = 0; offset < 10000; offset += 1000) {
      const { data: batch, error: batchErr } = await supabase
        .from('bs_signals')
        .select('lead_id')
        .range(offset, offset + 999)
      if (batchErr || !batch || batch.length === 0) break
      allSignalLeads.push(...batch)
    }

    let withSignals = 0
    if (allSignalLeads.length > 0) {
      const signalLeadIds = [...new Set(allSignalLeads.map((s: { lead_id: number }) => s.lead_id))]
      if (signalLeadIds.length > 0) {
        let withSignalsQuery = supabase
          .from('bs_leads')
          .select('id', { count: 'exact', head: true })
          .in('id', signalLeadIds)
        withSignalsQuery = applyFilters(withSignalsQuery, params)
        const { count: signalCount } = await withSignalsQuery
        withSignals = signalCount || 0
      }
    }

    // Average completeness — batch fetch to handle >1000 leads
    const completenessData: { completeness: number | null }[] = []
    for (let offset = 0; offset < 5000; offset += 1000) {
      let batchQuery = supabase
        .from('bs_leads')
        .select('completeness')
        .range(offset, offset + 999)
      batchQuery = applyFilters(batchQuery, params)
      const { data: batch } = await batchQuery
      if (!batch || batch.length === 0) break
      completenessData.push(...batch)
    }

    let avg_completeness = 0
    if (completenessData.length > 0) {
      const sum = completenessData.reduce(
        (acc: number, row: { completeness: number | null }) =>
          acc + (row.completeness || 0),
        0
      )
      avg_completeness = parseFloat((sum / completenessData.length).toFixed(2))
    }

    return NextResponse.json({
      total: total || 0,
      hot_count: hot_count || 0,
      warm_count: warm_count || 0,
      with_signals: withSignals,
      avg_completeness,
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
