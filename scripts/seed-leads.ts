/**
 * Bay Sentinel — Seed Script for Leads, Signals & Enrichment Logs
 *
 * Generates 600+ realistic Bay Area property leads across 3 counties,
 * attaches distress/opportunity signals, and creates enrichment logs.
 *
 * Usage:  npx tsx scripts/seed-leads.ts
 * Env:    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Config & Constants
// ---------------------------------------------------------------------------

const LEADS_PER_COUNTY = 200
const BATCH_SIZE = 50

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in env.'
  )
  process.exit(1)
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey)

// ---------------------------------------------------------------------------
// Reference Data
// ---------------------------------------------------------------------------

interface CityInfo {
  name: string
  lat: number
  lng: number
  zipCodes: string[]
}

interface CountyDef {
  name: string
  apnPrefix: string
  cities: CityInfo[]
}

const COUNTIES: CountyDef[] = [
  {
    name: 'Santa Clara',
    apnPrefix: '2',
    cities: [
      { name: 'San Jose', lat: 37.3382, lng: -121.8863, zipCodes: ['95112', '95116', '95122', '95126', '95128', '95131', '95132', '95136', '95148'] },
      { name: 'Sunnyvale', lat: 37.3688, lng: -122.0363, zipCodes: ['94085', '94086', '94087', '94089'] },
      { name: 'Palo Alto', lat: 37.4419, lng: -122.1430, zipCodes: ['94301', '94303', '94304', '94306'] },
      { name: 'Mountain View', lat: 37.3861, lng: -122.0839, zipCodes: ['94040', '94041', '94043'] },
      { name: 'Santa Clara', lat: 37.3541, lng: -121.9552, zipCodes: ['95050', '95051', '95054'] },
      { name: 'Cupertino', lat: 37.3230, lng: -122.0322, zipCodes: ['95014', '95015'] },
      { name: 'Milpitas', lat: 37.4323, lng: -121.8996, zipCodes: ['95035'] },
      { name: 'Campbell', lat: 37.2872, lng: -121.9500, zipCodes: ['95008', '95009'] },
      { name: 'Los Gatos', lat: 37.2358, lng: -121.9624, zipCodes: ['95030', '95032'] },
      { name: 'Saratoga', lat: 37.2639, lng: -122.0230, zipCodes: ['95070', '95071'] },
    ],
  },
  {
    name: 'San Mateo',
    apnPrefix: '0',
    cities: [
      { name: 'San Mateo', lat: 37.5630, lng: -122.3255, zipCodes: ['94401', '94402', '94403', '94404'] },
      { name: 'Redwood City', lat: 37.4852, lng: -122.2364, zipCodes: ['94061', '94062', '94063', '94065'] },
      { name: 'Daly City', lat: 37.6879, lng: -122.4702, zipCodes: ['94014', '94015'] },
      { name: 'South San Francisco', lat: 37.6547, lng: -122.4077, zipCodes: ['94080'] },
      { name: 'Burlingame', lat: 37.5841, lng: -122.3661, zipCodes: ['94010'] },
      { name: 'Foster City', lat: 37.5585, lng: -122.2711, zipCodes: ['94404'] },
      { name: 'Half Moon Bay', lat: 37.4636, lng: -122.4286, zipCodes: ['94019'] },
      { name: 'Pacifica', lat: 37.6138, lng: -122.4869, zipCodes: ['94044'] },
      { name: 'Menlo Park', lat: 37.4530, lng: -122.1817, zipCodes: ['94025', '94026'] },
      { name: 'San Carlos', lat: 37.5072, lng: -122.2605, zipCodes: ['94070'] },
    ],
  },
  {
    name: 'Alameda',
    apnPrefix: '4',
    cities: [
      { name: 'Oakland', lat: 37.8044, lng: -122.2712, zipCodes: ['94601', '94602', '94603', '94605', '94606', '94607', '94609', '94610', '94611', '94612'] },
      { name: 'Fremont', lat: 37.5485, lng: -121.9886, zipCodes: ['94536', '94538', '94539'] },
      { name: 'Hayward', lat: 37.6688, lng: -122.0808, zipCodes: ['94541', '94542', '94544', '94545'] },
      { name: 'Berkeley', lat: 37.8716, lng: -122.2727, zipCodes: ['94702', '94703', '94704', '94705', '94707', '94708', '94709', '94710'] },
      { name: 'Alameda', lat: 37.7652, lng: -122.2416, zipCodes: ['94501', '94502'] },
      { name: 'San Leandro', lat: 37.7249, lng: -122.1561, zipCodes: ['94577', '94578', '94579'] },
      { name: 'Livermore', lat: 37.6819, lng: -121.7680, zipCodes: ['94550', '94551'] },
      { name: 'Pleasanton', lat: 37.6624, lng: -121.8747, zipCodes: ['94566', '94568'] },
      { name: 'Dublin', lat: 37.7022, lng: -121.9358, zipCodes: ['94568'] },
      { name: 'Union City', lat: 37.5934, lng: -122.0439, zipCodes: ['94587'] },
    ],
  },
]

const STREET_NAMES = [
  'Main St', 'Oak Ave', 'Elm St', 'Pine Dr', 'Maple Ln', 'Cedar Ct',
  'Birch Way', 'Walnut Blvd', 'Cherry Rd', 'Ash Pl', 'Willow St',
  'Park Ave', 'Lincoln Blvd', 'Washington Ave', 'Jefferson Dr', 'Grant Rd',
  'Hamilton Ave', 'Madison St', 'Monroe Dr', 'Valley View Ct',
  'Hillside Terr', 'Sunset Dr', 'Canyon Rd', 'Creek Way', 'Spring St',
  'Garden Ave', 'Vista Ln', 'Ridge Rd', 'Harbor Blvd', 'Bay Dr',
]

const FIRST_NAMES = [
  'James', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald',
  'Steven', 'Paul', 'Andrew', 'Kenneth', 'George', 'Edward', 'Nancy',
  'Karen', 'Susan', 'Lisa', 'Margaret', 'Dorothy', 'Sandra', 'Ashley',
  'Kimberly', 'Emily', 'Jennifer', 'Sarah', 'Amanda', 'Jessica', 'Linda',
  'Mary', 'Patricia', 'Elizabeth', 'Barbara', 'Michelle',
]

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez',
  'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres',
  'Nguyen', 'Hill', 'Flores', 'Green', 'Adams', 'Nelson', 'Baker',
  'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Gomez',
  'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker', 'Cruz', 'Edwards',
  'Collins', 'Reyes', 'Stewart', 'Morris',
]

const PROPERTY_TYPES = [
  { type: 'SFR', weight: 70 },
  { type: 'Condo', weight: 15 },
  { type: 'Townhouse', weight: 10 },
  { type: 'Multi-Family', weight: 5 },
]

const BED_DISTRIBUTION = [
  { beds: 2, weight: 20 },
  { beds: 3, weight: 35 },
  { beds: 4, weight: 30 },
  { beds: 5, weight: 15 },
]

const SIGNAL_TYPES_WEIGHTED = [
  { type: 'absentee', weight: 25 },
  { type: 'long_term_owner', weight: 20 },
  { type: 'tax_delinquent', weight: 12 },
  { type: 'vacancy', weight: 10 },
  { type: 'nod', weight: 8 },
  { type: 'free_clear', weight: 8 },
  { type: 'lis_pendens', weight: 5 },
  { type: 'executor_deed', weight: 4 },
  { type: 'quitclaim', weight: 3 },
  { type: 'auction', weight: 3 },
  { type: 'reo', weight: 2 },
]

const SIGNAL_DISPLAY_NAMES: Record<string, string> = {
  absentee: 'Absentee Owner Detected',
  long_term_owner: 'Long-Term Ownership (15+ years)',
  tax_delinquent: 'Tax Delinquency Filed',
  vacancy: 'USPS Vacancy Indicator',
  nod: 'Notice of Default Filed',
  free_clear: 'Free & Clear Title',
  lis_pendens: 'Lis Pendens Filed',
  executor_deed: 'Executor Deed Recorded',
  quitclaim: 'Quitclaim Deed Recorded',
  auction: 'Scheduled for Auction',
  reo: 'REO / Bank-Owned',
}

const SIGNAL_WEIGHTS: Record<string, number> = {
  vacancy: 15,
  free_clear: 14,
  absentee: 13,
  long_term_owner: 12,
  executor_deed: 11,
  quitclaim: 10,
  tax_delinquent: 9,
  lis_pendens: 8,
  nod: 7,
  auction: 7,
  reo: 6,
}

const WILDFIRE_RISK_WEIGHTED = [
  { value: 'Low', weight: 60 },
  { value: 'Medium', weight: 25 },
  { value: 'High', weight: 10 },
  { value: 'Very Low', weight: 5 },
]

const FLOOD_ZONE_WEIGHTED = [
  { value: 'Zone X', weight: 70 },
  { value: 'Zone AE', weight: 15 },
  { value: 'Zone A', weight: 10 },
  { value: 'Zone D', weight: 5 },
]

const ZONING_OPTIONS = ['R1', 'R2', 'R3', 'RM', 'PD']

const ENRICHMENT_SOURCES = ['batch_data', 'county_assessor', 'skip_trace', 'usps']

const OUT_OF_STATE_CITIES = [
  'Portland, OR', 'Seattle, WA', 'Phoenix, AZ', 'Las Vegas, NV',
  'Denver, CO', 'Austin, TX', 'Chicago, IL', 'New York, NY',
  'Miami, FL', 'Nashville, TN', 'Atlanta, GA', 'Salt Lake City, UT',
]

// ---------------------------------------------------------------------------
// Utility Helpers
// ---------------------------------------------------------------------------

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function weightedPick<T extends { weight: number }>(items: readonly T[]): T {
  const total = items.reduce((s, i) => s + i.weight, 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= item.weight
    if (r <= 0) return item
  }
  return items[items.length - 1]
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function generateAPN(prefix: string): string {
  const a = rand(100, 999)
  const b = rand(10, 99)
  const c = rand(100, 999)
  return `${prefix}${a}-${b}-${c}`
}

function computeCompleteness(lead: Record<string, unknown>): number {
  const fields = [
    'address', 'city', 'county', 'zip_code', 'apn',
    'latitude', 'longitude', 'property_type', 'beds', 'baths',
    'sqft_living', 'sqft_lot', 'year_built', 'assessed_value',
    'estimated_value', 'last_sale_date', 'last_sale_price',
    'owner_name', 'owner_phone', 'owner_email', 'mailing_address',
    'is_absentee', 'wildfire_risk', 'flood_zone',
  ]
  const filled = fields.filter(
    (f) => lead[f] != null && lead[f] !== ''
  ).length
  return Math.round((filled / fields.length) * 100) / 100
}

// Mirrors lib/scoring.ts logic
function computeDistressScore(
  lead: Record<string, unknown>,
  signals: Array<{ signal_type: string; weight: number }>
): { score: number; priority: string } {
  let score = 0

  // Signal scoring (60% weight)
  const sw: Record<string, number> = {
    vacancy: 15, free_clear: 14, absentee: 13, long_term_owner: 12,
    executor_deed: 11, quitclaim: 10, tax_delinquent: 9,
    lis_pendens: 8, nod: 7, auction: 7, reo: 6,
    nts: 3, mechanic_lien: 3, bankruptcy: 8,
  }
  let signalScore = signals.reduce(
    (sum, s) => sum + (sw[s.signal_type] || 5), 0
  )
  const stackingBonus = Math.max(0, signals.length - 1) * 5
  signalScore = Math.min(signalScore + stackingBonus, 60)
  score += signalScore

  // Property fit (25% weight)
  let fitScore = 0
  const ev = lead.estimated_value as number | null
  if (ev) {
    if (ev >= 700000 && ev <= 3000000) {
      fitScore += ev <= 1500000 ? 8 : 5
    }
  }
  const lot = lead.sqft_lot as number | null
  if (lot && lot >= 5000 && lot <= 10000) fitScore += 4
  const yb = lead.year_built as number | null
  if (yb && yb >= 1950 && yb <= 1980) fitScore += 4
  const lsd = lead.last_sale_date as string | null
  if (lsd) {
    const saleYear = new Date(lsd).getFullYear()
    if (saleYear < 2016) fitScore += 5
  }
  if (lead.has_garage) fitScore += 2
  const av = lead.assessed_value as number | null
  if (av && av >= 800000 && av <= 3000000) fitScore += 2
  score += Math.min(fitScore, 25)

  // Owner indicators (10% weight)
  let ownerScore = 0
  if (lead.is_absentee) ownerScore += 5
  if (lead.is_out_of_state) ownerScore += 3
  const yo = lead.years_owned as number | null
  if (yo && yo >= 20) ownerScore += 2
  score += Math.min(ownerScore, 10)

  score = Math.max(0, Math.min(100, score))

  let priority: string
  if (score >= 80) priority = 'critical'
  else if (score >= 50) priority = 'high'
  else if (score >= 25) priority = 'med'
  else priority = 'low'

  return { score, priority }
}

// ---------------------------------------------------------------------------
// Lead Generation
// ---------------------------------------------------------------------------

interface LeadRow {
  address: string
  city: string
  county: string
  zip_code: string
  apn: string
  latitude: number
  longitude: number
  property_type: string
  beds: number
  baths: number
  sqft_living: number
  sqft_lot: number
  year_built: number
  zoning: string
  has_garage: boolean
  assessed_value: number
  estimated_value: number
  last_sale_date: string
  last_sale_price: number
  wildfire_risk: string
  flood_zone: string
  owner_name: string
  owner_phone: string | null
  owner_email: string | null
  mailing_address: string
  is_absentee: boolean
  is_out_of_state: boolean
  is_institutional: boolean
  years_owned: number
  equity_percent: number
  completeness: number
  source: string
  distress_score: number
  upside_score: number
  lead_priority: string
}

function generateLead(county: CountyDef): LeadRow {
  const city = pick(county.cities)
  const streetNum = rand(100, 9999)
  const street = pick(STREET_NAMES)
  const address = `${streetNum} ${street}`
  const zip = pick(city.zipCodes)

  const lat = city.lat + randFloat(-0.01, 0.01)
  const lng = city.lng + randFloat(-0.01, 0.01)

  const apn = generateAPN(county.apnPrefix)

  const propType = weightedPick(PROPERTY_TYPES).type
  const beds = weightedPick(BED_DISTRIBUTION).beds
  const bathsRaw = beds + rand(-1, 1)
  const baths = Math.max(1, bathsRaw)

  // Sqft correlated with beds
  const baseSqft = 600 + beds * 350
  const sqftLiving = baseSqft + rand(-200, 500)
  const sqftLot = propType === 'Condo' ? rand(800, 2500) : rand(2000, 15000)

  // Year built — weighted toward 1950-1985
  let yearBuilt: number
  const yearRoll = Math.random()
  if (yearRoll < 0.1) yearBuilt = rand(1935, 1949)
  else if (yearRoll < 0.55) yearBuilt = rand(1950, 1975)
  else if (yearRoll < 0.8) yearBuilt = rand(1976, 1990)
  else if (yearRoll < 0.95) yearBuilt = rand(1991, 2005)
  else yearBuilt = rand(2006, 2015)

  const zoning = pick(ZONING_OPTIONS)
  const hasGarage = Math.random() < 0.7

  // Value correlated with sqft and city prestige
  const prestigeMultiplier =
    ['Palo Alto', 'Cupertino', 'Saratoga', 'Los Gatos', 'Menlo Park', 'Burlingame'].includes(city.name)
      ? randFloat(1.3, 1.8)
      : ['Mountain View', 'Sunnyvale', 'San Carlos', 'Foster City', 'Berkeley', 'Pleasanton'].includes(city.name)
        ? randFloat(1.1, 1.4)
        : randFloat(0.8, 1.1)

  const baseValue = sqftLiving * randFloat(450, 850)
  const assessedValue = Math.round(baseValue * prestigeMultiplier)
  const estimatedValue = Math.round(assessedValue * randFloat(1.1, 1.5))

  // Last sale
  const saleYear = rand(2000, 2024)
  const saleMonth = rand(1, 12)
  const saleDay = rand(1, 28)
  const lastSaleDate = formatDate(new Date(saleYear, saleMonth - 1, saleDay))
  const lastSalePrice = Math.round(estimatedValue * randFloat(0.6, 0.95))

  // Owner
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const ownerName = `${firstName} ${lastName}`

  const hasPhone = Math.random() < 0.65
  const hasEmail = Math.random() < 0.45
  const ownerPhone = hasPhone
    ? `(${rand(408, 925)}) ${rand(200, 999)}-${rand(1000, 9999)}`
    : null
  const ownerEmail = hasEmail
    ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'aol.com'])}`
    : null

  // Absentee & out of state
  const isAbsentee = Math.random() < 0.3
  const isOutOfState = isAbsentee && Math.random() < 0.33
  const isInstitutional = Math.random() < 0.03

  let mailingAddress: string
  if (isOutOfState) {
    const outCity = pick(OUT_OF_STATE_CITIES)
    mailingAddress = `${rand(100, 9999)} ${pick(STREET_NAMES)}, ${outCity}`
  } else if (isAbsentee) {
    const otherCity = pick(county.cities)
    mailingAddress = `${rand(100, 9999)} ${pick(STREET_NAMES)}, ${otherCity.name}, CA ${pick(otherCity.zipCodes)}`
  } else {
    mailingAddress = `${address}, ${city.name}, CA ${zip}`
  }

  const currentYear = 2026
  const yearsOwned = currentYear - saleYear

  // Equity — higher for longer ownership
  const baseEquity = 20 + yearsOwned * 2.5
  const equityPercent = Math.min(95, Math.round(baseEquity + randFloat(-5, 10)))

  const wildfireRisk = weightedPick(WILDFIRE_RISK_WEIGHTED).value
  const floodZone = weightedPick(FLOOD_ZONE_WEIGHTED).value
  const source = Math.random() < 0.6 ? 'county_assessor' : 'batch_data'

  const leadObj: Record<string, unknown> = {
    address, city: city.name, county: county.name, zip_code: zip, apn,
    latitude: Math.round(lat * 10000) / 10000,
    longitude: Math.round(lng * 10000) / 10000,
    property_type: propType, beds, baths, sqft_living: sqftLiving,
    sqft_lot: sqftLot, year_built: yearBuilt, zoning, has_garage: hasGarage,
    assessed_value: assessedValue, estimated_value: estimatedValue,
    last_sale_date: lastSaleDate, last_sale_price: lastSalePrice,
    wildfire_risk: wildfireRisk, flood_zone: floodZone,
    owner_name: ownerName, owner_phone: ownerPhone, owner_email: ownerEmail,
    mailing_address: mailingAddress, is_absentee: isAbsentee,
    is_out_of_state: isOutOfState, is_institutional: isInstitutional,
    years_owned: yearsOwned, equity_percent: equityPercent, source,
  }

  const completeness = computeCompleteness(leadObj)

  return {
    ...leadObj,
    completeness,
    distress_score: 0,  // will be computed after signals
    upside_score: rand(10, 60),
    lead_priority: 'low',  // will be computed after signals
  } as LeadRow
}

// ---------------------------------------------------------------------------
// Signal Generation
// ---------------------------------------------------------------------------

interface SignalRow {
  lead_id: number
  name: string
  signal_type: string
  weight: number
  detected_at: string
  source: string
}

function generateSignalsForLead(leadId: number): SignalRow[] {
  // Determine how many signals this lead gets
  const roll = Math.random()
  let count: number
  if (roll < 0.30) count = 0       // 30% no signals
  else if (roll < 0.55) count = 1   // 25% one signal
  else if (roll < 0.75) count = 2   // 20% two signals
  else if (roll < 0.90) count = 3   // 15% three signals
  else count = rand(4, 6)           // 10% four or more

  if (count === 0) return []

  const usedTypes = new Set<string>()
  const signals: SignalRow[] = []

  for (let i = 0; i < count; i++) {
    let signalType: string
    let attempts = 0
    do {
      signalType = weightedPick(SIGNAL_TYPES_WEIGHTED).type
      attempts++
    } while (usedTypes.has(signalType) && attempts < 20)

    if (usedTypes.has(signalType)) continue
    usedTypes.add(signalType)

    const daysAgo = rand(1, 365)
    const detectedAt = new Date(Date.now() - daysAgo * 86400000).toISOString()

    const sources: Record<string, string> = {
      absentee: 'absentee_detection',
      long_term_owner: 'county_assessor',
      tax_delinquent: 'county_tax_collector',
      vacancy: 'usps_vacancy',
      nod: 'county_recorder',
      free_clear: 'county_assessor',
      lis_pendens: 'county_recorder',
      executor_deed: 'county_recorder',
      quitclaim: 'county_recorder',
      auction: 'auction_monitor',
      reo: 'auction_monitor',
    }

    signals.push({
      lead_id: leadId,
      name: SIGNAL_DISPLAY_NAMES[signalType] || signalType,
      signal_type: signalType,
      weight: SIGNAL_WEIGHTS[signalType] || 5,
      detected_at: detectedAt,
      source: sources[signalType] || 'system',
    })
  }

  return signals
}

// ---------------------------------------------------------------------------
// Enrichment Log Generation
// ---------------------------------------------------------------------------

interface EnrichmentLogRow {
  lead_id: number
  source: string
  status: string
  fields_enriched: string[]
  duration: number
  created_at: string
}

function generateEnrichmentLog(leadId: number): EnrichmentLogRow | null {
  if (Math.random() > 0.5) return null

  const source = pick(ENRICHMENT_SOURCES)

  const fieldOptions: Record<string, string[]> = {
    batch_data: ['owner_name', 'owner_phone', 'owner_email', 'mailing_address', 'estimated_value'],
    county_assessor: ['assessed_value', 'year_built', 'sqft_living', 'sqft_lot', 'beds', 'baths', 'zoning'],
    skip_trace: ['owner_phone', 'owner_email', 'mailing_address'],
    usps: ['is_absentee', 'mailing_address'],
  }

  const available = fieldOptions[source] || ['owner_name']
  const numFields = rand(1, Math.min(4, available.length))
  const fieldsEnriched = available.sort(() => Math.random() - 0.5).slice(0, numFields)

  const status = Math.random() < 0.9 ? 'success' : 'partial'
  const duration = randFloat(0.2, 4.5)
  const daysAgo = rand(0, 90)
  const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString()

  return {
    lead_id: leadId,
    source,
    status,
    fields_enriched: fieldsEnriched,
    duration: Math.round(duration * 100) / 100,
    created_at: createdAt,
  }
}

// ---------------------------------------------------------------------------
// Batch Insert Helper
// ---------------------------------------------------------------------------

async function batchInsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  batchSize: number
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)
    const { error } = await supabase.from(table).insert(chunk)
    if (error) {
      console.error(`  ERROR inserting into ${table} (batch ${Math.floor(i / batchSize) + 1}):`, error.message)
      throw error
    }
  }
}

// ---------------------------------------------------------------------------
// Main Seed Function
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const startTime = Date.now()
  console.log('=== Bay Sentinel — Lead Seeder ===')
  console.log(`Target: ${COUNTIES.length} counties x ${LEADS_PER_COUNTY} leads = ${COUNTIES.length * LEADS_PER_COUNTY} leads\n`)

  // Step 1: Generate all leads
  console.log('[1/6] Generating lead data...')
  const allLeads: LeadRow[] = []
  for (const county of COUNTIES) {
    for (let i = 0; i < LEADS_PER_COUNTY; i++) {
      allLeads.push(generateLead(county))
    }
  }
  console.log(`  Generated ${allLeads.length} leads`)

  // Step 2: Insert leads
  console.log('[2/6] Inserting leads into database...')
  const leadInsertStart = Date.now()

  // Insert in batches and collect IDs
  const insertedLeadIds: number[] = []
  for (let i = 0; i < allLeads.length; i += BATCH_SIZE) {
    const chunk = allLeads.slice(i, i + BATCH_SIZE)
    const { data, error } = await supabase
      .from('leads')
      .insert(chunk)
      .select('id')

    if (error) {
      console.error(`  ERROR inserting leads (batch ${Math.floor(i / BATCH_SIZE) + 1}):`, error.message)
      // On unique constraint violations, try inserting one by one
      if (error.code === '23505') {
        console.log('  Retrying batch with individual inserts...')
        for (const lead of chunk) {
          const { data: singleData, error: singleErr } = await supabase
            .from('leads')
            .insert(lead)
            .select('id')
          if (singleErr) {
            if (singleErr.code === '23505') continue // skip duplicates
            console.error('    Skip:', singleErr.message)
          } else if (singleData) {
            insertedLeadIds.push(singleData[0].id)
          }
        }
        continue
      }
      throw error
    }
    if (data) {
      insertedLeadIds.push(...data.map((r: { id: number }) => r.id))
    }

    const pct = Math.round(((i + chunk.length) / allLeads.length) * 100)
    process.stdout.write(`  Progress: ${pct}% (${i + chunk.length}/${allLeads.length})\r`)
  }
  console.log(`\n  Inserted ${insertedLeadIds.length} leads in ${((Date.now() - leadInsertStart) / 1000).toFixed(1)}s`)

  // Step 3: Generate and insert signals
  console.log('[3/6] Generating signals...')
  const allSignals: SignalRow[] = []
  const leadSignalsMap = new Map<number, SignalRow[]>()

  for (const leadId of insertedLeadIds) {
    const signals = generateSignalsForLead(leadId)
    if (signals.length > 0) {
      allSignals.push(...signals)
      leadSignalsMap.set(leadId, signals)
    }
  }

  const leadsWithSignals = leadSignalsMap.size
  const totalSignals = allSignals.length
  console.log(`  Generated ${totalSignals} signals for ${leadsWithSignals} leads (${Math.round((leadsWithSignals / insertedLeadIds.length) * 100)}% coverage)`)

  console.log('[4/6] Inserting signals...')
  if (allSignals.length > 0) {
    await batchInsert('signals', allSignals as unknown as Record<string, unknown>[], BATCH_SIZE)
  }
  console.log(`  Inserted ${allSignals.length} signals`)

  // Step 4: Compute distress scores and update leads
  console.log('[5/6] Computing distress scores and updating leads...')
  const scoreUpdates: Array<{ id: number; distress_score: number; lead_priority: string }> = []

  for (let idx = 0; idx < insertedLeadIds.length; idx++) {
    const leadId = insertedLeadIds[idx]
    const leadData = allLeads[idx]
    const signals = leadSignalsMap.get(leadId) || []

    const { score, priority } = computeDistressScore(
      leadData as unknown as Record<string, unknown>,
      signals
    )

    scoreUpdates.push({
      id: leadId,
      distress_score: score,
      lead_priority: priority,
    })
  }

  // Update scores in batches
  for (let i = 0; i < scoreUpdates.length; i += BATCH_SIZE) {
    const chunk = scoreUpdates.slice(i, i + BATCH_SIZE)
    const promises = chunk.map((update) =>
      supabase
        .from('leads')
        .update({
          distress_score: update.distress_score,
          lead_priority: update.lead_priority,
        })
        .eq('id', update.id)
    )
    const results = await Promise.all(promises)
    const errors = results.filter((r) => r.error)
    if (errors.length > 0) {
      console.error(`  ${errors.length} score update errors in batch`)
    }
    const pct = Math.round(((i + chunk.length) / scoreUpdates.length) * 100)
    process.stdout.write(`  Progress: ${pct}%\r`)
  }

  // Score distribution summary
  const critical = scoreUpdates.filter((u) => u.lead_priority === 'critical').length
  const high = scoreUpdates.filter((u) => u.lead_priority === 'high').length
  const med = scoreUpdates.filter((u) => u.lead_priority === 'med').length
  const low = scoreUpdates.filter((u) => u.lead_priority === 'low').length
  console.log(`\n  Score distribution: Critical=${critical}, High=${high}, Med=${med}, Low=${low}`)

  // Step 5: Generate and insert enrichment logs
  console.log('[6/6] Generating enrichment logs...')
  const enrichmentLogs: EnrichmentLogRow[] = []
  for (const leadId of insertedLeadIds) {
    const log = generateEnrichmentLog(leadId)
    if (log) enrichmentLogs.push(log)
  }
  console.log(`  Generated ${enrichmentLogs.length} enrichment logs`)

  if (enrichmentLogs.length > 0) {
    await batchInsert('enrichment_logs', enrichmentLogs as unknown as Record<string, unknown>[], BATCH_SIZE)
  }
  console.log(`  Inserted ${enrichmentLogs.length} enrichment logs`)

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n=== Seed Complete ===')
  console.log(`  Leads:           ${insertedLeadIds.length}`)
  console.log(`  Signals:         ${totalSignals}`)
  console.log(`  Enrichment Logs: ${enrichmentLogs.length}`)
  console.log(`  Time:            ${elapsed}s`)
  console.log(`  Counties:        ${COUNTIES.map((c) => c.name).join(', ')}`)
  console.log('')
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .then(() => {
    console.log('Done.')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\nFATAL ERROR:', err)
    process.exit(1)
  })
