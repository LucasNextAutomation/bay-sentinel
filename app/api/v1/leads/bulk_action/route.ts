import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

const MAX_BULK_IDS = 500

interface BulkActionBody {
  action: 'enrich' | 'export'
  lead_ids: string[]
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

    if (lead_ids.length > MAX_BULK_IDS) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK_IDS} leads per bulk action` },
        { status: 400 }
      )
    }

    if (!lead_ids.every(id => typeof id === 'string' && id.length > 0)) {
      return NextResponse.json(
        { error: 'All lead_ids must be non-empty strings' },
        { status: 400 }
      )
    }

    const count = lead_ids.length

    if (action === 'enrich') {
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
          { error: 'Failed to create enrichment logs' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        message: `Queued ${count} leads for enrichment`,
        success: true,
        count,
        action: 'enrich',
      })
    }

    // action === 'export'
    const { data: leads, error: fetchErr } = await supabase
      .from('bs_leads')
      .select(
        'distress_score, address, county, estimated_value, assessed_value, beds, baths, sqft_living, year_built, owner_name, owner_phone, owner_email'
      )
      .in('id', lead_ids)

    if (fetchErr) {
      return NextResponse.json(
        { error: 'Failed to fetch leads for export' },
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
      message: `Exported ${(leads || []).length} leads`,
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
