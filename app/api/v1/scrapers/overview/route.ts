import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request)

    const { data: scrapers, error } = await supabase
      .from('scrapers')
      .select('*')
      .order('name', { ascending: true })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch scrapers', detail: error.message },
        { status: 500 }
      )
    }

    const list = scrapers || []

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
