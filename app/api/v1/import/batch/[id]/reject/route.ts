import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)

    const { id } = await params

    // Fetch the batch to verify it exists and is pending
    const { data: batch, error: fetchErr } = await supabase
      .from('bs_import_batches')
      .select('id, status')
      .eq('id', id)
      .single()

    if (fetchErr || !batch) {
      return NextResponse.json(
        { error: 'Import batch not found' },
        { status: 404 }
      )
    }

    if (batch.status !== 'pending') {
      return NextResponse.json(
        { error: `Batch has already been ${batch.status}` },
        { status: 400 }
      )
    }

    const { error: updateErr } = await supabase
      .from('bs_import_batches')
      .update({ status: 'rejected' })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json(
        { error: 'Failed to reject batch', detail: updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ status: 'rejected' })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
