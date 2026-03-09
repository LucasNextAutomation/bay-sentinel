import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

interface RowResult {
  row_index: number
  data: Record<string, unknown>
  valid: boolean
  errors: string[]
  duplicate: boolean
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)

    const { id } = await params

    // Fetch the batch
    const { data: batch, error: fetchErr } = await supabase
      .from('import_batches')
      .select('*')
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

    // Extract valid, non-duplicate rows
    const rowsData = batch.rows_data as RowResult[] | null
    if (!rowsData || !Array.isArray(rowsData)) {
      return NextResponse.json(
        { error: 'No row data found in batch' },
        { status: 400 }
      )
    }

    const validRows = rowsData.filter((r) => r.valid && !r.duplicate)

    if (validRows.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import' },
        { status: 400 }
      )
    }

    // Prepare leads for insertion
    const leadsToInsert = validRows.map((r) => ({
      ...r.data,
      distress_score: 0,
      lead_priority: 'low',
      completeness: 0,
    }))

    // Insert in batches of 100 to avoid payload limits
    let totalImported = 0
    let totalFailed = 0

    for (let i = 0; i < leadsToInsert.length; i += 100) {
      const chunk = leadsToInsert.slice(i, i + 100)
      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .insert(chunk)
        .select('id')

      if (insertErr) {
        totalFailed += chunk.length
      } else {
        totalImported += inserted?.length || 0
      }
    }

    // Update batch status
    const newStatus = totalFailed > 0 && totalImported > 0
      ? 'imported'   // partial success still counts as imported
      : totalImported > 0
        ? 'imported'
        : 'failed'

    const { error: updateErr } = await supabase
      .from('import_batches')
      .update({
        status: newStatus,
        imported_rows: totalImported,
      })
      .eq('id', id)

    if (updateErr) {
      return NextResponse.json(
        { error: 'Leads imported but failed to update batch status', detail: updateErr.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      status: newStatus,
      imported_rows: totalImported,
      failed_rows: totalFailed,
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
