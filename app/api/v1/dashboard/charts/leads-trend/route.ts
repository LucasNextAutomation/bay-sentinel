import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const sinceDate = thirtyDaysAgo.toISOString()

    const { data, error } = await supabase
      .from('bs_leads')
      .select('created_at')
      .gte('created_at', sinceDate)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const countsByDate: Record<string, number> = {}

    // Pre-fill all 30 days with 0 so there are no gaps
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      const dateStr = d.toISOString().split('T')[0]
      countsByDate[dateStr] = 0
    }

    data?.forEach((lead) => {
      const dateStr = lead.created_at?.split('T')[0]
      if (dateStr && dateStr in countsByDate) {
        countsByDate[dateStr]++
      }
    })

    const result = Object.entries(countsByDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }))

    return NextResponse.json(result)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    const message = thrown instanceof Error ? thrown.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
