import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams

    // Get total count with filters
    let countQuery = supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
    countQuery = applyFilters(countQuery, params)
    const { count, error: countError } = await countQuery

    if (countError) {
      return NextResponse.json(
        { error: 'Failed to fetch export preview', detail: countError.message },
        { status: 500 }
      )
    }

    // Get first 10 rows for preview
    let dataQuery = supabase
      .from('leads')
      .select('distress_score, address, county, owner_name, estimated_value, assessed_value')
      .limit(10)
    dataQuery = applyFilters(dataQuery, params)
    const { data, error } = await dataQuery

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch export preview', detail: error.message },
        { status: 500 }
      )
    }

    const preview = (data || []).map((row: Record<string, unknown>) => ({
      score: row.distress_score,
      address: row.address,
      county: row.county,
      owner: row.owner_name,
      est_value: row.estimated_value,
      assessed: row.assessed_value,
    }))

    return NextResponse.json({ total: count || 0, preview })
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
