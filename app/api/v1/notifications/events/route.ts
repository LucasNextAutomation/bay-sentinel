import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)
  } catch (res: unknown) {
    if (res instanceof Response) {
      const body = await res.json()
      return NextResponse.json(body, { status: res.status })
    }
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')

    let query = supabase
      .from('notification_events')
      .select('*')
      .order('created_at', { ascending: true })

    if (since) {
      const sinceDate = new Date(Number(since) * 1000).toISOString()
      query = query.gt('created_at', sinceDate)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const events = (data ?? []).map((event) => ({
      ts: Math.floor(new Date(event.created_at).getTime() / 1000),
      data: event,
    }))

    return NextResponse.json(events)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
