import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireWorkerActions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireWorkerActions(request)

    const { data: scrapers, error } = await supabase
      .from('bs_scrapers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      // bs_scrapers may not exist in minimal setup — return empty so UI still works
      return NextResponse.json({
        scrapers: [],
        summary: { total: 0, total_records: 0, healthy: 0, degraded: 0, down: 0 },
      })
    }

    const list = (scrapers || []).map((s: Record<string, unknown>) => ({
      id: s.id,
      name: s.name,
      health: s.status === 'idle' ? 'healthy' : s.status === 'error' ? 'down' : (s.status as string) || 'healthy',
      county: s.county,
      type: s.source_type,
      category: s.source_type,
      tier: 1,
      active: s.is_active ?? true,
      records_fetched: (s.leads_found as number) || 0,
      successes: s.status === 'error' ? 0 : 1,
      failures: s.status === 'error' ? 1 : 0,
      last_run: s.last_run,
    }))

    const total = list.length
    const total_records = list.reduce(
      (sum: number, s: Record<string, unknown>) =>
        sum + ((s.records_fetched as number) || 0),
      0
    )
    const healthy = list.filter(
      (s: Record<string, unknown>) => s.health === 'healthy'
    ).length
    const degraded = list.filter(
      (s: Record<string, unknown>) => s.health === 'degraded'
    ).length
    const down = list.filter(
      (s: Record<string, unknown>) => s.health === 'down'
    ).length

    return NextResponse.json({
      scrapers: list,
      summary: { total, total_records, healthy, degraded, down },
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
