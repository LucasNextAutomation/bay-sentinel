import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

interface BulkActionBody {
  action: 'enrich' | 'export'
  lead_ids: number[]
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
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
      // Create enrichment log entries for each lead
      const enrichmentLogs = lead_ids.map((lead_id) => ({
        lead_id,
        source: 'bulk_enrich',
        status: 'pending',
        triggered_by: user.username,
        created_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('bs_enrichment_logs')
        .insert(enrichmentLogs)

      if (error) {
        return NextResponse.json(
          { error: 'Failed to create enrichment logs', detail: error.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        count,
        action: 'enrich',
      })
    }

    // action === 'export' — return CSV data for selected leads
    const { data: leads, error: fetchErr } = await supabase
      .from('bs_leads')
      .select(
        'distress_score, address, county, estimated_value, assessed_value, beds, baths, sqft_living, year_built, owner_name, owner_phone, owner_email'
      )
      .in('id', lead_ids)

    if (fetchErr) {
      return NextResponse.json(
        { error: 'Failed to fetch leads for export', detail: fetchErr.message },
        { status: 500 }
      )
    }

    const headers = [
      'Score', 'Address', 'County', 'Est. Value', 'Assessed Value',
      'Beds', 'Baths', 'Sqft', 'Year Built', 'Owner', 'Phone', 'Email',
    ]

    const csvLines: string[] = [headers.join(',')]

    for (const lead of leads || []) {
      const row = [
        escapeCSV(lead.distress_score),
        escapeCSV(lead.address),
        escapeCSV(lead.county),
        escapeCSV(lead.estimated_value),
        escapeCSV(lead.assessed_value),
        escapeCSV(lead.beds),
        escapeCSV(lead.baths),
        escapeCSV(lead.sqft_living),
        escapeCSV(lead.year_built),
        escapeCSV(lead.owner_name),
        escapeCSV(lead.owner_phone),
        escapeCSV(lead.owner_email),
      ]
      csvLines.push(row.join(','))
    }

    return NextResponse.json({
      success: true,
      count: (leads || []).length,
      action: 'export',
      csv: csvLines.join('\n'),
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
