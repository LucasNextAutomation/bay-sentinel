import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

const MAP_LIMIT = 2000

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams

    // Fetch in two batches to overcome Supabase 1000-row default
    let query1 = supabase
      .from('bs_leads')
      .select('id, latitude, longitude, distress_score, address, county, estimated_value')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .range(0, 999)

    query1 = applyFilters(query1, params)
    const { data: batch1, error: error1 } = await query1

    let query2 = supabase
      .from('bs_leads')
      .select('id, latitude, longitude, distress_score, address, county, estimated_value')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .range(1000, MAP_LIMIT - 1)

    query2 = applyFilters(query2, params)
    const { data: batch2 } = await query2

    const data = [...(batch1 || []), ...(batch2 || [])]
    const error = error1

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch map data', detail: error.message },
        { status: 500 }
      )
    }

    const results = (data || []).map((lead: Record<string, unknown>) => ({
      id: lead.id,
      lat: lead.latitude,
      lng: lead.longitude,
      score: lead.distress_score,
      address: lead.address,
      county: lead.county,
      price: lead.estimated_value,
    }))

    return NextResponse.json(results)
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
