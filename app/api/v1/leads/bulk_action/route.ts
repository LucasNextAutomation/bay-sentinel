import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

interface BulkActionBody {
  action: 'enrich' | 'export'
  lead_ids: number[]
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    let body: BulkActionBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      )
    }

    const { action, lead_ids } = body

    if (!action || !['enrich', 'export'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be "enrich" or "export".' },
        { status: 400 }
      )
    }

    if (!Array.isArray(lead_ids) || lead_ids.length === 0) {
      return NextResponse.json(
        { error: 'lead_ids must be a non-empty array' },
        { status: 400 }
      )
    }

    const count = lead_ids.length

    if (action === 'enrich') {
      const { error } = await supabase
        .from('operations')
        .insert({
          type: 'bulk_enrich',
          status: 'pending',
          payload: { lead_ids },
          created_by: user.id,
          created_at: new Date().toISOString(),
        })

      if (error) {
        return NextResponse.json(
          { error: 'Failed to create enrichment operation', detail: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        message: `Enrichment started for ${count} leads`,
      })
    }

    // action === 'export'
    return NextResponse.json({
      message: `Export started for ${count} leads`,
    })
  } catch (thrown) {
    if (thrown instanceof Response) {
      return thrown
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
