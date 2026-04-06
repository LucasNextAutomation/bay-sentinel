import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireWorkerActions } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireWorkerActions(request)

    const params = request.nextUrl.searchParams
    const limit = Math.min(
      Math.max(1, parseInt(params.get('limit') || '25', 10)),
      100
    )

    const { data, error } = await supabase
      .from('bs_operations')
      .select('id, operation_key, label, status, is_active, started_at, completed_at, triggered_by, duration_seconds, leads_created, leads_updated, leads_enriched, leads_failed, params')
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch operation history', detail: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
