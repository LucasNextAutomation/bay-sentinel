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

    // Flatten rows_data for frontend table display
    const rows = Array.isArray(data.rows_data)
      ? data.rows_data.map((r: { row_index?: number; data?: Record<string, unknown>; valid?: boolean; duplicate?: boolean; errors?: string[] }) => ({
          row: r.row_index ?? 0,
          status: !r.valid ? 'error' : r.duplicate ? 'duplicate' : 'valid',
          apn: String(r.data?.apn || ''),
          county: String(r.data?.county || ''),
          address: String(r.data?.address || ''),
          city: String(r.data?.city || ''),
          owner: String(r.data?.owner_name || ''),
          beds: r.data?.beds ?? '',
          assessed: r.data?.assessed_value ?? '',
          errors: r.errors || [],
        }))
      : []

    return NextResponse.json({
      ...data,
      rows,
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
