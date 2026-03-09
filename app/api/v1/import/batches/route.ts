import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { data, error } = await supabase
      .from('import_batches')
      .select('id, filename, status, total_rows, valid_rows, error_rows, duplicate_rows, imported_rows, unmapped_columns, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch import batches', detail: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json(data || [])
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
