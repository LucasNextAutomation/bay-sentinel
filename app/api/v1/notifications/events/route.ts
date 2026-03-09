import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { searchParams } = request.nextUrl
    const since = searchParams.get('since')

    let query = supabase
      .from('bs_notification_events')
      .select('event_type, data, created_at')
      .order('created_at', { ascending: true })

    if (since) {
      // Accept ISO timestamp (e.g. "2026-03-01T00:00:00.000Z")
      // Also support Unix timestamp for backwards compatibility
      const isNumeric = /^\d+(\.\d+)?$/.test(since)
      const sinceDate = isNumeric
        ? new Date(Number(since) * 1000).toISOString()
        : since
      query = query.gt('created_at', sinceDate)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch notification events', detail: error.message },
        { status: 500 }
      )
    }

    const events = (data ?? []).map((event) => ({
      type: event.event_type,
      data: event.data,
      created_at: event.created_at,
      ts: Math.floor(new Date(event.created_at).getTime() / 1000),
    }))

    return NextResponse.json(events)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
