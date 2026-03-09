import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

const SQFT_TOLERANCE = 0.3
const YEAR_TOLERANCE = 15
const COMP_LIMIT = 10

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)

    const { id } = await params

    // Fetch the target lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('id, county, sqft_living, year_built')
      .eq('id', id)
      .single()

    if (leadError || !lead) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    // Build comparable query
    let query = supabase
      .from('leads')
      .select('id, address, beds, sqft_living, year_built, last_sale_date, last_sale_price, distress_score')
      .neq('id', lead.id)
      .eq('county', lead.county)
      .limit(COMP_LIMIT)

    if (lead.sqft_living) {
      const minSqft = Math.round(lead.sqft_living * (1 - SQFT_TOLERANCE))
      const maxSqft = Math.round(lead.sqft_living * (1 + SQFT_TOLERANCE))
      query = query.gte('sqft_living', minSqft).lte('sqft_living', maxSqft)
    }

    if (lead.year_built) {
      const minYear = lead.year_built - YEAR_TOLERANCE
      const maxYear = lead.year_built + YEAR_TOLERANCE
      query = query.gte('year_built', minYear).lte('year_built', maxYear)
    }

    query = query.order('last_sale_date', { ascending: false, nullsFirst: false })

    const { data: comps, error: compsError } = await query

    if (compsError) {
      return NextResponse.json(
        { error: 'Failed to fetch comparables', detail: compsError.message },
        { status: 500 }
      )
    }

    const results = (comps || []).map((c: Record<string, unknown>) => ({
      id: c.id,
      address: c.address,
      beds: c.beds,
      sqft: c.sqft_living,
      year_built: c.year_built,
      last_sale_date: c.last_sale_date,
      last_sale_price: c.last_sale_price,
      distress_score: c.distress_score,
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
