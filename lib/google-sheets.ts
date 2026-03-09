import { google } from 'googleapis'

interface LeadRow {
  distress_score: number
  address: string
  county: string
  estimated_value?: number | null
  assessed_value?: number | null
  beds?: number | null
  baths?: number | null
  sqft_living?: number | null
  sqft_lot?: number | null
  has_garage?: boolean | null
  year_built?: number | null
  last_sale_date?: string | null
  last_sale_price?: number | null
  active_signals?: Array<{ name: string }>
  owner_name?: string | null
  mailing_address?: string | null
  is_absentee?: boolean | null
  owner_phone?: string | null
  owner_email?: string | null
  latitude?: number | null
  longitude?: number | null
  is_mls_listed?: boolean | null
}

function getAuth() {
  const credentials = process.env.GOOGLE_SHEETS_CREDENTIALS
  if (!credentials) return null

  const parsed = JSON.parse(Buffer.from(credentials, 'base64').toString())
  return new google.auth.GoogleAuth({
    credentials: parsed,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
}

export async function syncToGoogleSheet(
  leads: LeadRow[]
): Promise<{ rows_synced: number; sheet_id: string }> {
  const auth = getAuth()
  if (!auth) throw new Error('Google Sheets credentials not configured')

  const sheets = google.sheets({ version: 'v4', auth })
  const sheetId = process.env.GOOGLE_SHEET_ID
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID not configured')

  // Headers matching Nelson's 23-column spec
  const headers = [
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

  // Format leads into rows
  const rows = leads.map((l) => [
    l.distress_score,
    l.address,
    l.county,
    l.estimated_value || '',
    l.assessed_value || '',
    l.beds || '',
    l.baths || '',
    l.sqft_living || '',
    l.sqft_lot || '',
    l.has_garage ? 'Yes' : 'No',
    l.year_built || '',
    l.last_sale_date || '',
    l.last_sale_price || '',
    (l.active_signals || []).map((s) => s.name).join(', '),
    (l.active_signals || []).length,
    l.owner_name || '',
    l.mailing_address || '',
    l.is_absentee ? 'Yes' : 'No',
    l.owner_phone || '',
    l.owner_email || '',
    l.latitude && l.longitude
      ? `https://maps.googleapis.com/maps/api/streetview?location=${l.latitude},${l.longitude}&size=600x400`
      : '',
    l.latitude && l.longitude
      ? `https://www.google.com/maps/@${l.latitude},${l.longitude},18z`
      : '',
    l.is_mls_listed ? 'Yes' : 'No',
  ])

  // Clear existing data and write new
  await sheets.spreadsheets.values.clear({
    spreadsheetId: sheetId,
    range: 'Sheet1!A:W',
  })

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: 'Sheet1!A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [headers, ...rows],
    },
  })

  return { rows_synced: rows.length, sheet_id: sheetId }
}
