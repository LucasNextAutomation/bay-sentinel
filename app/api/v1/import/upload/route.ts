import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'
import { parse } from 'csv-parse/sync'
import { v4 as uuidv4 } from 'uuid'

/* ------------------------------------------------------------------ */
/*  Column mapping — CSV header → leads table column                   */
/* ------------------------------------------------------------------ */

const COLUMN_MAP: Record<string, string> = {
  // APN
  apn: 'apn',
  'parcel number': 'apn',
  'parcel_number': 'apn',
  'assessor parcel number': 'apn',
  // Address
  address: 'address',
  'property address': 'address',
  'street address': 'address',
  'property_address': 'address',
  // City
  city: 'city',
  // County
  county: 'county',
  // State
  state: 'state',
  // Zip
  zip: 'zip_code',
  zip_code: 'zip_code',
  'zip code': 'zip_code',
  zipcode: 'zip_code',
  // Owner
  owner: 'owner_name',
  owner_name: 'owner_name',
  'owner name': 'owner_name',
  // Phone
  phone: 'owner_phone',
  owner_phone: 'owner_phone',
  'owner phone': 'owner_phone',
  // Email
  email: 'owner_email',
  owner_email: 'owner_email',
  'owner email': 'owner_email',
  // Mailing address
  mailing_address: 'mailing_address',
  'mailing address': 'mailing_address',
  // Property type
  property_type: 'property_type',
  'property type': 'property_type',
  type: 'property_type',
  // Beds
  beds: 'beds',
  bedrooms: 'beds',
  // Baths
  baths: 'baths',
  bathrooms: 'baths',
  // Sqft
  sqft: 'sqft_living',
  sqft_living: 'sqft_living',
  'living sqft': 'sqft_living',
  'square feet': 'sqft_living',
  // Lot sqft
  lot_sqft: 'sqft_lot',
  sqft_lot: 'sqft_lot',
  'lot size': 'sqft_lot',
  'lot sqft': 'sqft_lot',
  // Year built
  year_built: 'year_built',
  'year built': 'year_built',
  yearbuilt: 'year_built',
  // Assessed value
  assessed_value: 'assessed_value',
  'assessed value': 'assessed_value',
  assessment: 'assessed_value',
  // Estimated value
  estimated_value: 'estimated_value',
  'estimated value': 'estimated_value',
  'market value': 'estimated_value',
  // Latitude / Longitude
  latitude: 'latitude',
  lat: 'latitude',
  longitude: 'longitude',
  lng: 'longitude',
  lon: 'longitude',
  // Last sale
  last_sale_date: 'last_sale_date',
  'last sale date': 'last_sale_date',
  last_sale_price: 'last_sale_price',
  'last sale price': 'last_sale_price',
}

const VALID_COUNTIES = [
  'Alameda', 'Contra Costa', 'Marin', 'Napa', 'San Francisco',
  'San Mateo', 'Santa Clara', 'Solano', 'Sonoma',
]

const NUMERIC_FIELDS = new Set([
  'beds', 'baths', 'sqft_living', 'sqft_lot', 'year_built',
  'assessed_value', 'estimated_value', 'latitude', 'longitude',
  'last_sale_price',
])

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function mapColumns(headers: string[]): {
  mapped: Record<number, string>
  unmapped: string[]
} {
  const mapped: Record<number, string> = {}
  const unmapped: string[] = []

  headers.forEach((header, idx) => {
    const normalized = header.toLowerCase().trim()
    const target = COLUMN_MAP[normalized]
    if (target) {
      mapped[idx] = target
    } else {
      unmapped.push(header)
    }
  })

  return { mapped, unmapped }
}

function cleanNumeric(val: string): number | null {
  if (!val) return null
  const cleaned = val.replace(/[$,\s]/g, '')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function parseRow(
  row: string[],
  columnMap: Record<number, string>
): Record<string, unknown> {
  const lead: Record<string, unknown> = {}

  for (const [idxStr, field] of Object.entries(columnMap)) {
    const idx = parseInt(idxStr, 10)
    const rawVal = (row[idx] || '').trim()
    if (!rawVal) continue

    if (NUMERIC_FIELDS.has(field)) {
      lead[field] = cleanNumeric(rawVal)
    } else if (field === 'last_sale_date') {
      // Try to parse as date
      const d = new Date(rawVal)
      lead[field] = isNaN(d.getTime()) ? rawVal : d.toISOString().split('T')[0]
    } else {
      lead[field] = rawVal
    }
  }

  return lead
}

interface RowResult {
  row_index: number
  data: Record<string, unknown>
  valid: boolean
  errors: string[]
  duplicate: boolean
}

function validateRow(
  data: Record<string, unknown>,
  rowIndex: number,
  existingApns: Set<string>,
  seenApns: Set<string>
): RowResult {
  const errors: string[] = []
  let duplicate = false

  // Must have at least address or APN
  if (!data.address && !data.apn) {
    errors.push('Missing both address and APN — at least one is required')
  }

  // Validate county if provided
  if (data.county) {
    const countyStr = String(data.county)
    if (!VALID_COUNTIES.some((c) => c.toLowerCase() === countyStr.toLowerCase())) {
      errors.push(`Unknown county: ${countyStr}`)
    }
  }

  // Check for duplicate APN
  if (data.apn) {
    const apnStr = String(data.apn)
    if (existingApns.has(apnStr) || seenApns.has(apnStr)) {
      duplicate = true
    }
    seenApns.add(apnStr)
  }

  return {
    row_index: rowIndex,
    data,
    valid: errors.length === 0,
    errors,
    duplicate,
  }
}

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(request: NextRequest) {
  try {
    await requireAuth(request)

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const autoImport = formData.get('auto_import') === 'true'

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided. Upload a CSV file as the "file" field.' },
        { status: 400 }
      )
    }

    if (!file.name.endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Only CSV files are supported' },
        { status: 400 }
      )
    }

    // Read file content
    const text = await file.text()
    if (!text.trim()) {
      return NextResponse.json(
        { error: 'File is empty' },
        { status: 400 }
      )
    }

    // Parse CSV
    let records: string[][]
    try {
      records = parse(text, {
        skip_empty_lines: true,
        relax_column_count: true,
      })
    } catch (parseErr) {
      const msg = parseErr instanceof Error ? parseErr.message : 'Parse error'
      return NextResponse.json(
        { error: `Failed to parse CSV: ${msg}` },
        { status: 400 }
      )
    }

    if (records.length < 2) {
      return NextResponse.json(
        { error: 'CSV must have at least a header row and one data row' },
        { status: 400 }
      )
    }

    const headers = records[0]
    const dataRows = records.slice(1)

    // Map columns
    const { mapped, unmapped } = mapColumns(headers)

    if (Object.keys(mapped).length === 0) {
      return NextResponse.json(
        { error: 'Could not map any CSV columns to known fields', unmapped_columns: unmapped },
        { status: 400 }
      )
    }

    // Fetch existing APNs for duplicate detection
    const { data: existingLeads } = await supabase
      .from('leads')
      .select('apn')

    const existingApns = new Set(
      (existingLeads || [])
        .map((l: { apn: string | null }) => l.apn)
        .filter((a): a is string => a != null)
    )

    // Parse and validate all rows
    const seenApns = new Set<string>()
    const rowResults: RowResult[] = dataRows.map((row, idx) => {
      const data = parseRow(row, mapped)
      return validateRow(data, idx + 1, existingApns, seenApns)
    })

    const validRows = rowResults.filter((r) => r.valid && !r.duplicate)
    const errorRows = rowResults.filter((r) => !r.valid)
    const duplicateRows = rowResults.filter((r) => r.valid && r.duplicate)

    // Auto-import path: insert directly if all valid
    if (autoImport && errorRows.length === 0 && validRows.length > 0) {
      const leadsToInsert = validRows.map((r) => ({
        ...r.data,
        distress_score: 0,
        lead_priority: 'low',
        completeness: 0,
      }))

      const { data: inserted, error: insertErr } = await supabase
        .from('leads')
        .insert(leadsToInsert)
        .select('id')

      if (insertErr) {
        return NextResponse.json(
          { error: 'Failed to import leads', detail: insertErr.message },
          { status: 500 }
        )
      }

      return NextResponse.json({
        auto_imported: true,
        imported: inserted?.length || 0,
        duplicates: duplicateRows.length,
      })
    }

    // Batch review path: create import_batch record
    const batchId = uuidv4()

    const { error: batchErr } = await supabase.from('import_batches').insert({
      id: batchId,
      filename: file.name,
      status: 'pending',
      total_rows: dataRows.length,
      valid_rows: validRows.length,
      error_rows: errorRows.length,
      duplicate_rows: duplicateRows.length,
      imported_rows: 0,
      unmapped_columns: unmapped.length > 0 ? unmapped : null,
      rows_data: rowResults,
    })

    if (batchErr) {
      return NextResponse.json(
        { error: 'Failed to create import batch', detail: batchErr.message },
        { status: 500 }
      )
    }

    // Return preview (first 20 rows)
    const preview = rowResults.slice(0, 20).map((r) => ({
      row_index: r.row_index,
      data: r.data,
      valid: r.valid,
      errors: r.errors,
      duplicate: r.duplicate,
    }))

    return NextResponse.json({
      auto_imported: false,
      batch_id: batchId,
      filename: file.name,
      total_rows: dataRows.length,
      valid_rows: validRows.length,
      error_rows: errorRows.length,
      duplicate_rows: duplicateRows.length,
      unmapped_columns: unmapped,
      preview,
    })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
