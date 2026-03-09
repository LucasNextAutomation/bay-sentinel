import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { applyFilters } from '@/lib/filters'

const CSV_LIMIT = 5000

const CSV_HEADERS = [
  'Score',
  'Address',
  'County',
  'Price Est.',
  'Assessed Value',
  'Beds',
  'Baths',
  'Sqft',
  'Lot Sqft',
  'Garage',
  'Year Built',
  'Last Sale',
  'Last Price',
  'Signals',
  'Signal Count',
  'Owner',
  'Owner Address',
  'Absentee',
  'Phone',
  'Email',
  'Street View',
  'Aerial',
  'MLS Listed',
]

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildStreetViewUrl(address: string | null, city: string | null, county: string | null): string {
  if (!address) return ''
  const location = [address, city, county, 'CA'].filter(Boolean).join(', ')
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=&query=${encodeURIComponent(location)}`
}

function buildAerialUrl(lat: number | null, lng: number | null): string {
  if (!lat || !lng) return ''
  return `https://www.google.com/maps/@${lat},${lng},18z/data=!3m1!1e3`
}

interface Signal {
  name: string
}

interface LeadRow {
  distress_score: number | null
  address: string | null
  city: string | null
  county: string | null
  estimated_value: number | null
  assessed_value: number | null
  beds: number | null
  baths: number | null
  sqft_living: number | null
  sqft_lot: number | null
  has_garage: boolean | null
  year_built: number | null
  last_sale_date: string | null
  last_sale_price: number | null
  owner_name: string | null
  mailing_address: string | null
  is_absentee: boolean | null
  owner_phone: string | null
  owner_email: string | null
  latitude: number | null
  longitude: number | null
  signals: Signal[] | null
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const params = request.nextUrl.searchParams

    let query = supabase
      .from('leads')
      .select(
        'distress_score, address, city, county, estimated_value, assessed_value, beds, baths, sqft_living, sqft_lot, has_garage, year_built, last_sale_date, last_sale_price, owner_name, mailing_address, is_absentee, owner_phone, owner_email, latitude, longitude, signals(name)'
      )
      .limit(CSV_LIMIT)

    query = applyFilters(query, params)

    const { data, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to export leads', detail: error.message },
        { status: 500 }
      )
    }

    const rows = data as LeadRow[] | null

    const csvLines: string[] = [CSV_HEADERS.join(',')]

    for (const lead of rows || []) {
      const signals = Array.isArray(lead.signals) ? lead.signals : []
      const signalNames = signals.map((s) => s.name).join('; ')
      const signalCount = signals.length

      const row = [
        escapeCSV(lead.distress_score),
        escapeCSV(lead.address),
        escapeCSV(lead.county),
        escapeCSV(lead.estimated_value),
        escapeCSV(lead.assessed_value),
        escapeCSV(lead.beds),
        escapeCSV(lead.baths),
        escapeCSV(lead.sqft_living),
        escapeCSV(lead.sqft_lot),
        escapeCSV(lead.has_garage ? 'Yes' : 'No'),
        escapeCSV(lead.year_built),
        escapeCSV(lead.last_sale_date),
        escapeCSV(lead.last_sale_price),
        escapeCSV(signalNames),
        escapeCSV(signalCount),
        escapeCSV(lead.owner_name),
        escapeCSV(lead.mailing_address),
        escapeCSV(lead.is_absentee ? 'Yes' : 'No'),
        escapeCSV(lead.owner_phone),
        escapeCSV(lead.owner_email),
        escapeCSV(buildStreetViewUrl(lead.address, lead.city, lead.county)),
        escapeCSV(buildAerialUrl(lead.latitude, lead.longitude)),
        escapeCSV(''), // MLS Listed - placeholder
      ]

      csvLines.push(row.join(','))
    }

    const csvContent = csvLines.join('\n')

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="bay_sentinel_leads.csv"',
      },
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
