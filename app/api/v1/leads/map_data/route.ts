import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

const MAP_LIMIT = 2000

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams

    let query = supabase
      .from('bs_leads')
      .select('id, latitude, longitude, distress_score, address, county, estimated_value')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .limit(MAP_LIMIT)

    query = applyFilters(query, params)

    const { data, error } = await query

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
