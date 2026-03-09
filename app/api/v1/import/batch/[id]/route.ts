import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)

    const { id } = await params

    const { data, error } = await supabase
      .from('bs_import_batches')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Import batch not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
