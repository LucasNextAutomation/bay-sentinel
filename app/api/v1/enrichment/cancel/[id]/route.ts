import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request)

    const { id } = await params

    // Verify operation exists and is active
    const { data: op, error: fetchErr } = await supabase
      .from('operations')
      .select('id, status, is_active, operation_key, label')
      .eq('id', id)
      .single()

    if (fetchErr || !op) {
      return NextResponse.json(
        { error: 'Operation not found' },
        { status: 404 }
      )
    }

    if (!op.is_active) {
      return NextResponse.json(
        { error: 'Operation is not active' },
        { status: 400 }
      )
    }

    const completedAt = new Date().toISOString()

    const { error: updateErr } = await supabase
      .from('operations')
      .update({
        status: 'cancelled',
        is_active: false,
        completed_at: completedAt,
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json(
        { error: 'Failed to cancel operation', detail: updateErr.message },
        { status: 500 }
      )
    }

    // Insert cancellation notification
    await supabase.from('notification_events').insert({
      event_type: 'operation_cancelled',
      data: {
        operation_id: op.id,
        operation_key: op.operation_key,
        label: op.label,
      },
    })

    return NextResponse.json({ status: 'cancelled' })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
