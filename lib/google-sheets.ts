import { google } from 'googleapis'
import { supabase } from './db'

const SHEET_TITLE = 'Bay Sentinel — Hot Leads'

interface LeadRow {
  distress_score: number
  address: string
  city: string | null
  county: string
  zip_code: string | null
  estimated_value: number | null
  assessed_value: number | null
  beds: number | null
  baths: number | null
  sqft_living: number | null
  sqft_lot: number | null
  year_built: number | null
  owner_name: string | null
  owner_phone: string | null
  owner_email: string | null
  mailing_address: string | null
  lead_priority: string
  property_type: string | null
  is_absentee: boolean | null
  wildfire_risk: string | null
  flood_zone: string | null
  latitude: number | null
  longitude: number | null
  last_sale_date: string | null
  last_sale_price: number | null
}

function getAuth() {
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
  if (!credentials) {
    throw new Error('GOOGLE_SHEETS_CREDENTIALS env var not set. Set it to a base64-encoded service account JSON key.')
  }

  const parsed = JSON.parse(Buffer.from(credentials, 'base64').toString())
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

async function getOrCreateSheet(): Promise<string> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })

  // Check env var first
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (sheetId) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: sheetId })
      return sheetId
    } catch {
      // Sheet was deleted or invalid, fall through to create
    }
  }

  // Check DB config
  const { data: configRow } = await supabase
    .from('bs_app_config')
    .select('value')
    .eq('key', 'google_sheet_id')
    .single()

  if (configRow?.value) {
    try {
      await sheets.spreadsheets.get({ spreadsheetId: configRow.value })
      return configRow.value
    } catch {
      // Sheet was deleted, create new
    }
  }

  // Create new spreadsheet
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: SHEET_TITLE },
      sheets: [
        {
          properties: {
            title: 'Hot Leads',
            gridProperties: { frozenRowCount: 1 },
          },
        },
      ],
    },
  })

  const newId = response.data.spreadsheetId!

  // Store in DB
  await supabase
    .from('bs_app_config')
    .upsert({ key: 'google_sheet_id', value: newId }, { onConflict: 'key' })

  return newId
}

export async function exportToGoogleSheets(minScore: number = 70): Promise<{
  sheet_url: string
  rows_synced: number
  sheet_id: string
}> {
  const auth = getAuth()
  const sheets = google.sheets({ version: 'v4', auth })
  const spreadsheetId = await getOrCreateSheet()

  // Fetch leads above threshold (batch to overcome 1000-row limit)
  const allLeads: LeadRow[] = []
  for (let offset = 0; offset < 10000; offset += 1000) {
    const { data: batch, error } = await supabase
      .from('bs_leads')
      .select(
        'distress_score, address, city, county, zip_code, estimated_value, assessed_value, beds, baths, sqft_living, sqft_lot, year_built, owner_name, owner_phone, owner_email, mailing_address, lead_priority, property_type, is_absentee, wildfire_risk, flood_zone, latitude, longitude, last_sale_date, last_sale_price'
      )
      .gte('distress_score', minScore)
      .order('distress_score', { ascending: false })
      .range(offset, offset + 999)

    if (error || !batch || batch.length === 0) break
    allLeads.push(...(batch as LeadRow[]))
  }

  // Headers
  const headers = [
    'Score', 'Priority', 'Address', 'City', 'County', 'ZIP',
    'Est. Value', 'Assessed', 'Type', 'Beds', 'Baths',
    'Sqft', 'Lot Sqft', 'Year Built',
    'Last Sale', 'Last Price',
    'Owner', 'Phone', 'Email', 'Mailing Address',
    'Absentee', 'Wildfire', 'Flood Zone',
    'Street View', 'Map Link',
    'Updated',
  ]

  const rows = allLeads.map((l) => [
    l.distress_score,
    l.lead_priority,
    l.address,
    l.city || '',
    l.county,
    l.zip_code || '',
    l.estimated_value || '',
    l.assessed_value || '',
    l.property_type || '',
    l.beds || '',
    l.baths || '',
    l.sqft_living || '',
    l.sqft_lot || '',
    l.year_built || '',
    l.last_sale_date || '',
    l.last_sale_price || '',
    l.owner_name || '',
    l.owner_phone || '',
    l.owner_email || '',
    l.mailing_address || '',
    l.is_absentee ? 'Yes' : 'No',
    l.wildfire_risk || '',
    l.flood_zone || '',
    l.latitude && l.longitude
      ? `https://maps.googleapis.com/maps/api/streetview?location=${l.latitude},${l.longitude}&size=600x400`
      : '',
    l.latitude && l.longitude
      ? `https://www.google.com/maps/@${l.latitude},${l.longitude},18z`
      : '',
    new Date().toISOString().split('T')[0],
  ])

  // Clear and write
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: 'Hot Leads!A:Z',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: 'Hot Leads!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers, ...rows],
    },
  })

  // Bold header row — get actual sheet tab ID first
  try {
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties' })
    const hotLeadsTab = sheetMeta.data.sheets?.find(
      (s) => s.properties?.title === 'Hot Leads'
    )
    const tabId = hotLeadsTab?.properties?.sheetId ?? 0

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: tabId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                },
              },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
        ],
      },
    })
  } catch {
    // Non-critical: formatting failed but data is written
  }

  return {
    sheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
    rows_synced: allLeads.length,
    sheet_id: spreadsheetId,
  }
}
