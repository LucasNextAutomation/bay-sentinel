/**
 * Bay Sentinel — Seed Script for Users, Leads, Signals & Enrichment Logs
 *
 * Generates 600+ realistic Bay Area property leads across 3 counties,
 * attaches distress/opportunity signals, computes distress scores,
 * creates enrichment logs, and hashes user passwords.
 *
 * Usage:  npx tsx scripts/seed-leads.ts
 * Env:    Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from '@supabase/supabase-js'
import { hash } from 'bcryptjs'
import * as fs from 'fs'
import * as path from 'path'

// Load .env.local
const envPath = path.resolve(process.cwd(), '.env.local')
const envContent = fs.readFileSync(envPath, 'utf-8')
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=')
  if (key && !key.startsWith('#')) {
    process.env[key.trim()] = vals.join('=').trim()
  }
})

// ---------------------------------------------------------------------------
// Config & Constants
// ---------------------------------------------------------------------------

const LEADS_PER_COUNTY = 200
const LEAD_BATCH_SIZE = 50
const SIGNAL_BATCH_SIZE = 100

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    'ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

// ---------------------------------------------------------------------------
// Reference Data
// ---------------------------------------------------------------------------

interface CityInfo {
  name: string
  lat: number
  lng: number
  zipRange: [number, number]   // generate realistic zips within range
  zipCodes: string[]           // predefined realistic zips
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
      { name: 'San Jose',       lat: 37.3382, lng: -121.8863, zipRange: [95110, 95199], zipCodes: ['95110', '95112', '95116', '95118', '95120', '95122', '95124', '95125', '95126', '95128', '95129', '95131', '95132', '95133', '95134', '95135', '95136', '95138', '95139', '95148'] },
      { name: 'Sunnyvale',      lat: 37.3688, lng: -122.0363, zipRange: [94085, 94089], zipCodes: ['94085', '94086', '94087', '94089'] },
      { name: 'Palo Alto',      lat: 37.4419, lng: -122.1430, zipRange: [94301, 94306], zipCodes: ['94301', '94303', '94304', '94306'] },
      { name: 'Mountain View',  lat: 37.3861, lng: -122.0839, zipRange: [94040, 94043], zipCodes: ['94040', '94041', '94043'] },
      { name: 'Santa Clara',    lat: 37.3541, lng: -121.9552, zipRange: [95050, 95056], zipCodes: ['95050', '95051', '95054'] },
      { name: 'Cupertino',      lat: 37.3230, lng: -122.0322, zipRange: [95014, 95015], zipCodes: ['95014', '95015'] },
      { name: 'Milpitas',       lat: 37.4323, lng: -121.8996, zipRange: [95035, 95036], zipCodes: ['95035', '95036'] },
      { name: 'Campbell',       lat: 37.2872, lng: -121.9500, zipRange: [95008, 95009], zipCodes: ['95008', '95009'] },
      { name: 'Los Gatos',      lat: 37.2358, lng: -121.9624, zipRange: [95030, 95033], zipCodes: ['95030', '95032', '95033'] },
      { name: 'Saratoga',       lat: 37.2638, lng: -122.0230, zipRange: [95070, 95071], zipCodes: ['95070', '95071'] },
    ],
  },
  {
    name: 'San Mateo',
    apnPrefix: '0',
    cities: [
      { name: 'San Mateo',              lat: 37.5630, lng: -122.3255, zipRange: [94401, 94404], zipCodes: ['94401', '94402', '94403', '94404'] },
      { name: 'Redwood City',           lat: 37.4852, lng: -122.2364, zipRange: [94061, 94065], zipCodes: ['94061', '94062', '94063', '94065'] },
      { name: 'Daly City',              lat: 37.6879, lng: -122.4702, zipRange: [94014, 94017], zipCodes: ['94014', '94015', '94017'] },
      { name: 'South San Francisco',    lat: 37.6547, lng: -122.4077, zipRange: [94080, 94083], zipCodes: ['94080', '94083'] },
      { name: 'Burlingame',             lat: 37.5841, lng: -122.3661, zipRange: [94010, 94012], zipCodes: ['94010', '94011'] },
      { name: 'Foster City',            lat: 37.5585, lng: -122.2711, zipRange: [94404, 94404], zipCodes: ['94404'] },
      { name: 'Half Moon Bay',          lat: 37.4636, lng: -122.4286, zipRange: [94019, 94019], zipCodes: ['94019'] },
      { name: 'Pacifica',               lat: 37.6138, lng: -122.4869, zipRange: [94044, 94044], zipCodes: ['94044'] },
      { name: 'Menlo Park',             lat: 37.4530, lng: -122.1817, zipRange: [94025, 94026], zipCodes: ['94025', '94026'] },
      { name: 'San Carlos',             lat: 37.5072, lng: -122.2605, zipRange: [94070, 94070], zipCodes: ['94070'] },
    ],
  },
  {
    name: 'Alameda',
    apnPrefix: '4',
    cities: [
      { name: 'Oakland',       lat: 37.8044, lng: -122.2712, zipRange: [94601, 94699], zipCodes: ['94601', '94602', '94603', '94605', '94606', '94607', '94609', '94610', '94611', '94612', '94618', '94619', '94621'] },
      { name: 'Fremont',       lat: 37.5485, lng: -121.9886, zipRange: [94536, 94539], zipCodes: ['94536', '94538', '94539'] },
      { name: 'Hayward',       lat: 37.6688, lng: -122.0808, zipRange: [94541, 94545], zipCodes: ['94541', '94542', '94544', '94545'] },
      { name: 'Berkeley',      lat: 37.8716, lng: -122.2727, zipRange: [94702, 94710], zipCodes: ['94702', '94703', '94704', '94705', '94707', '94708', '94709', '94710'] },
      { name: 'Alameda',       lat: 37.7652, lng: -122.2416, zipRange: [94501, 94502], zipCodes: ['94501', '94502'] },
      { name: 'San Leandro',   lat: 37.7249, lng: -122.1561, zipRange: [94577, 94579], zipCodes: ['94577', '94578', '94579'] },
      { name: 'Livermore',     lat: 37.6819, lng: -121.7680, zipRange: [94550, 94551], zipCodes: ['94550', '94551'] },
      { name: 'Pleasanton',    lat: 37.6624, lng: -121.8747, zipRange: [94566, 94568], zipCodes: ['94566', '94568'] },
      { name: 'Dublin',        lat: 37.7022, lng: -121.9358, zipRange: [94568, 94568], zipCodes: ['94568'] },
      { name: 'Union City',    lat: 37.5934, lng: -122.0439, zipRange: [94587, 94587], zipCodes: ['94587'] },
    ],
  },
  {
    name: 'San Francisco',
    apnPrefix: '3',
    cities: [
      { name: 'San Francisco', lat: 37.7749, lng: -122.4194, zipRange: [94102, 94134], zipCodes: ['94102', '94103', '94104', '94105', '94107', '94108', '94109', '94110', '94112', '94114', '94115', '94116', '94117', '94118', '94121', '94122', '94123', '94124', '94127', '94129', '94131', '94132', '94133', '94134'] },
    ],
  },
  {
    name: 'Contra Costa',
    apnPrefix: '1',
    cities: [
      { name: 'Walnut Creek',  lat: 37.9101, lng: -122.0652, zipRange: [94595, 94598], zipCodes: ['94595', '94596', '94597', '94598'] },
      { name: 'Concord',       lat: 37.9780, lng: -122.0311, zipRange: [94518, 94521], zipCodes: ['94518', '94519', '94520', '94521'] },
      { name: 'Richmond',      lat: 37.9358, lng: -122.3477, zipRange: [94801, 94808], zipCodes: ['94801', '94803', '94804', '94805', '94806'] },
      { name: 'Antioch',       lat: 38.0049, lng: -121.8058, zipRange: [94509, 94531], zipCodes: ['94509', '94531'] },
      { name: 'San Ramon',     lat: 37.7799, lng: -121.9780, zipRange: [94582, 94583], zipCodes: ['94582', '94583'] },
      { name: 'Pittsburg',     lat: 38.0280, lng: -121.8847, zipRange: [94565, 94565], zipCodes: ['94565'] },
      { name: 'Martinez',      lat: 38.0194, lng: -122.1341, zipRange: [94553, 94553], zipCodes: ['94553'] },
      { name: 'Lafayette',     lat: 37.8858, lng: -122.1180, zipRange: [94549, 94549], zipCodes: ['94549'] },
    ],
  },
  {
    name: 'Marin',
    apnPrefix: '5',
    cities: [
      { name: 'San Rafael',    lat: 37.9735, lng: -122.5311, zipRange: [94901, 94903], zipCodes: ['94901', '94903'] },
      { name: 'Novato',        lat: 38.1074, lng: -122.5697, zipRange: [94945, 94949], zipCodes: ['94945', '94947', '94949'] },
      { name: 'Mill Valley',   lat: 37.9060, lng: -122.5416, zipRange: [94941, 94942], zipCodes: ['94941', '94942'] },
      { name: 'Corte Madera',  lat: 37.9255, lng: -122.5276, zipRange: [94925, 94925], zipCodes: ['94925'] },
      { name: 'Tiburon',       lat: 37.8735, lng: -122.4567, zipRange: [94920, 94920], zipCodes: ['94920'] },
      { name: 'Sausalito',     lat: 37.8591, lng: -122.4852, zipRange: [94965, 94966], zipCodes: ['94965', '94966'] },
    ],
  },
  {
    name: 'Sonoma',
    apnPrefix: '6',
    cities: [
      { name: 'Santa Rosa',    lat: 38.4404, lng: -122.7141, zipRange: [95401, 95409], zipCodes: ['95401', '95403', '95404', '95405', '95407', '95409'] },
      { name: 'Petaluma',      lat: 38.2324, lng: -122.6367, zipRange: [94952, 94954], zipCodes: ['94952', '94954'] },
      { name: 'Rohnert Park',  lat: 38.3396, lng: -122.7011, zipRange: [94928, 94928], zipCodes: ['94928'] },
      { name: 'Sonoma',        lat: 38.2919, lng: -122.4580, zipRange: [95476, 95476], zipCodes: ['95476'] },
      { name: 'Windsor',       lat: 38.5471, lng: -122.8166, zipRange: [95492, 95492], zipCodes: ['95492'] },
      { name: 'Healdsburg',    lat: 38.6105, lng: -122.8697, zipRange: [95448, 95448], zipCodes: ['95448'] },
    ],
  },
  {
    name: 'Napa',
    apnPrefix: '7',
    cities: [
      { name: 'Napa',          lat: 38.2975, lng: -122.2869, zipRange: [94558, 94559], zipCodes: ['94558', '94559'] },
      { name: 'American Canyon', lat: 38.1749, lng: -122.2608, zipRange: [94503, 94503], zipCodes: ['94503'] },
      { name: 'St. Helena',    lat: 38.5052, lng: -122.4700, zipRange: [94574, 94574], zipCodes: ['94574'] },
      { name: 'Calistoga',     lat: 38.5788, lng: -122.5797, zipRange: [94515, 94515], zipCodes: ['94515'] },
      { name: 'Yountville',    lat: 38.4013, lng: -122.3608, zipRange: [94599, 94599], zipCodes: ['94599'] },
    ],
  },
  {
    name: 'Solano',
    apnPrefix: '8',
    cities: [
      { name: 'Vallejo',       lat: 38.1041, lng: -122.2566, zipRange: [94589, 94591], zipCodes: ['94589', '94590', '94591'] },
      { name: 'Fairfield',     lat: 38.2494, lng: -122.0400, zipRange: [94533, 94534], zipCodes: ['94533', '94534'] },
      { name: 'Vacaville',     lat: 38.3566, lng: -121.9877, zipRange: [95687, 95688], zipCodes: ['95687', '95688'] },
      { name: 'Benicia',       lat: 38.0494, lng: -122.1586, zipRange: [94510, 94510], zipCodes: ['94510'] },
      { name: 'Suisun City',   lat: 38.2388, lng: -122.0186, zipRange: [94585, 94585], zipCodes: ['94585'] },
      { name: 'Dixon',         lat: 38.4455, lng: -121.8233, zipRange: [95620, 95620], zipCodes: ['95620'] },
    ],
  },
]

// Real Bay Area street names per city — ensures realistic, geocodable addresses
const CITY_STREETS: Record<string, string[]> = {
  // Santa Clara County
  'San Jose':       ['S 1st St', 'S 10th St', 'E Santa Clara St', 'Almaden Blvd', 'Story Rd', 'King Rd', 'Alum Rock Ave', 'Monterey Rd', 'Meridian Ave', 'Willow Glen Way', 'Curtner Ave', 'Capitol Expy', 'Foxworthy Ave', 'Branham Ln', 'Blossom Hill Rd', 'Snell Ave', 'Santa Teresa Blvd', 'McKee Rd', 'San Carlos St', 'N Capitol Ave'],
  'Sunnyvale':      ['El Camino Real', 'Mathilda Ave', 'Sunnyvale Ave', 'Hollenbeck Ave', 'Mary Ave', 'Fair Oaks Ave', 'E Fremont Ave', 'S Wolfe Rd', 'W Olive Ave', 'W Iowa Ave'],
  'Palo Alto':      ['University Ave', 'Hamilton Ave', 'Middlefield Rd', 'Alma St', 'Oregon Expy', 'Lytton Ave', 'Cowper St', 'Waverley St', 'Emerson St', 'Bryant St'],
  'Mountain View':  ['Castro St', 'El Camino Real', 'Shoreline Blvd', 'Rengstorff Ave', 'Miramonte Ave', 'San Antonio Rd', 'Dana St', 'Church St', 'Calderon Ave', 'Latham St'],
  'Santa Clara':    ['El Camino Real', 'Monroe St', 'Benton St', 'Franklin St', 'Washington St', 'Market St', 'Homestead Rd', 'Lawrence Expy', 'Saratoga Ave', 'Forest Ave'],
  'Cupertino':      ['Stevens Creek Blvd', 'De Anza Blvd', 'Stelling Rd', 'Bubb Rd', 'Miller Ave', 'Bollinger Rd', 'McClellan Rd', 'Rainbow Dr', 'Blaney Ave', 'Rodrigues Ave'],
  'Milpitas':       ['Calaveras Blvd', 'Main St', 'Great Mall Pkwy', 'Jacklin Rd', 'Abel St', 'Serra Way', 'Hillview Dr', 'Yosemite Dr', 'Dixon Rd', 'Escuela Pkwy'],
  'Campbell':       ['E Campbell Ave', 'Winchester Blvd', 'Bascom Ave', 'S San Tomas Aquino Rd', 'Harrison Ave', 'Union Ave', 'Camden Ave', 'Dell Ave', 'Hacienda Ave', 'Railway Ave'],
  'Los Gatos':      ['N Santa Cruz Ave', 'University Ave', 'Main St', 'Los Gatos Blvd', 'Blossom Hill Rd', 'Shannon Rd', 'Loma Alta Ave', 'Almendra Ave', 'Elm St', 'Bayview Ave'],
  'Saratoga':       ['Saratoga Ave', 'Big Basin Way', 'Fruitvale Ave', 'Saratoga-Los Gatos Rd', 'Quito Rd', 'Cox Ave', 'Prospect Rd', 'Saratoga-Sunnyvale Rd', 'Herriman Ave', 'Oak St'],
  // San Mateo County
  'San Mateo':      ['E 3rd Ave', 'S El Camino Real', 'N Delaware St', 'W 25th Ave', 'Tilton Ave', 'Palm Ave', 'Claremont St', 'S Norfolk St', 'Laurel Ave', 'Humboldt St'],
  'Redwood City':   ['Broadway', 'El Camino Real', 'Middlefield Rd', 'Woodside Rd', 'Veterans Blvd', 'Winslow St', 'Stambaugh St', 'Arguello St', 'Jefferson Ave', 'Hopkins Ave'],
  'Daly City':      ['Mission St', 'Hillside Blvd', 'John Daly Blvd', 'Junipero Serra Blvd', 'Westlake Ave', 'Lake Merced Blvd', 'Skyline Blvd', 'Callan Blvd', 'Sullivan Ave', 'Templeton Ave'],
  'South San Francisco': ['Grand Ave', 'Linden Ave', 'Airport Blvd', 'El Camino Real', 'Spruce Ave', 'Maple Ave', 'Chestnut Ave', 'Miller Ave', 'Baden Ave', 'Commercial Ave'],
  'Burlingame':     ['Broadway', 'El Camino Real', 'Primrose Rd', 'California Dr', 'Park Rd', 'Howard Ave', 'Donnelly Ave', 'Bayswater Ave', 'Chapin Ave', 'Lorton Ave'],
  'Foster City':    ['Foster City Blvd', 'E Hillsdale Blvd', 'Shell Blvd', 'Beach Park Blvd', 'Edgewater Blvd', 'Bounty Dr', 'Triton Dr', 'Marlin Ave', 'Flying Cloud Isle', 'Balclutha Dr'],
  'Half Moon Bay':  ['Main St', 'Kelly Ave', 'Pilarcitos Ave', 'Mill St', 'Church St', 'Purissima St', 'Johnston St', 'Correas St', 'Poplar St', 'Miramontes St'],
  'Pacifica':       ['Palmetto Ave', 'Manor Dr', 'Linda Mar Blvd', 'Terra Nova Blvd', 'Oddstad Blvd', 'Crespi Dr', 'Francisco Blvd', 'Montecito Ave', 'Yosemite Dr', 'Roberts Rd'],
  'Menlo Park':     ['El Camino Real', 'Santa Cruz Ave', 'Middlefield Rd', 'Willow Rd', 'Ravenswood Ave', 'Alma St', 'Laurel St', 'University Dr', 'Glenwood Ave', 'Live Oak Ave'],
  'San Carlos':     ['El Camino Real', 'Laurel St', 'Cedar St', 'Elm St', 'Walnut St', 'Holly St', 'White Oak Way', 'Arroyo Ave', 'Howard Ave', 'Magnolia Ave'],
  // Alameda County
  'Oakland':        ['Broadway', 'International Blvd', 'MacArthur Blvd', 'Telegraph Ave', 'Grand Ave', 'Lakeshore Ave', 'Fruitvale Ave', 'Seminary Ave', 'Foothill Blvd', '73rd Ave', 'Bancroft Ave', 'E 14th St', 'High St', 'Park Blvd', 'Mandela Pkwy', '35th Ave', 'San Pablo Ave', 'Market St', 'Adeline St', 'Shattuck Ave'],
  'Fremont':        ['Fremont Blvd', 'Mowry Ave', 'Stevenson Blvd', 'Paseo Padre Pkwy', 'Warm Springs Blvd', 'Niles Blvd', 'Thornton Ave', 'Peralta Blvd', 'Driscoll Rd', 'Auto Mall Pkwy'],
  'Hayward':        ['Mission Blvd', 'Foothill Blvd', 'Tennyson Rd', 'Jackson St', 'B St', 'A St', 'Main St', 'Winton Ave', 'Hesperian Blvd', 'Industrial Pkwy'],
  'Berkeley':       ['University Ave', 'Shattuck Ave', 'Telegraph Ave', 'San Pablo Ave', 'Ashby Ave', 'Solano Ave', 'Sacramento St', 'Martin Luther King Jr Way', 'Dwight Way', 'Alcatraz Ave'],
  'Alameda':        ['Park St', 'Webster St', 'Lincoln Ave', 'Central Ave', 'Encinal Ave', 'Santa Clara Ave', 'Pacific Ave', 'San Jose Ave', 'Buena Vista Ave', 'Otis Dr'],
  'San Leandro':    ['E 14th St', 'Davis St', 'Washington Ave', 'Bancroft Ave', 'Hesperian Blvd', 'Estudillo Ave', 'Dutton Ave', 'Lewelling Blvd', 'Williams St', 'Callan Ave'],
  'Livermore':      ['First St', 'N Livermore Ave', 'Stanley Blvd', 'E Ave', 'Holmes St', 'Rincon Ave', 'Railroad Ave', 'Portola Ave', 'S Livermore Ave', 'Chestnut St'],
  'Pleasanton':     ['Main St', 'Santa Rita Rd', 'Hopyard Rd', 'Valley Ave', 'Bernal Ave', 'Sunol Blvd', 'Rose Ave', 'St Mary St', 'Division St', 'Peters Ave'],
  'Dublin':         ['Dublin Blvd', 'Amador Valley Blvd', 'Village Pkwy', 'Dougherty Rd', 'San Ramon Rd', 'Scarlett Dr', 'Silvergate Dr', 'Davona Dr', 'Brannigan St', 'Grafton St'],
  'Union City':     ['Alvarado-Niles Rd', 'Decoto Rd', 'Dyer St', 'Whipple Rd', 'Smith St', 'Union City Blvd', 'H St', 'Mission Blvd', 'Bettencourt St', 'Medallion Dr'],
  // San Francisco
  'San Francisco':  ['Market St', 'Mission St', 'Valencia St', 'Guerrero St', 'Divisadero St', 'Fillmore St', 'Haight St', 'Irving St', 'Judah St', 'Taraval St', 'Noriega St', 'Balboa St', 'Geary Blvd', 'Clement St', 'Columbus Ave', 'Grant Ave', 'Stockton St', 'Van Ness Ave', 'Folsom St', 'Howard St'],
  // Contra Costa
  'Walnut Creek':   ['N Main St', 'Mt Diablo Blvd', 'Ygnacio Valley Rd', 'Olympic Blvd', 'Locust St', 'Broadway Ln', 'Civic Dr', 'California Blvd', 'Treat Blvd', 'S Broadway'],
  'Concord':        ['Clayton Rd', 'Concord Blvd', 'Willow Pass Rd', 'Monument Blvd', 'Salvio St', 'Oak Grove Rd', 'Farm Bureau Rd', 'Galindo St', 'Port Chicago Hwy', 'Pacheco Blvd'],
  'Richmond':       ['Macdonald Ave', '23rd St', 'Cutting Blvd', 'Barrett Ave', 'San Pablo Ave', 'Harbour Way', 'Marina Way S', 'Carlson Blvd', 'Central Ave', 'Ohio Ave'],
  'Antioch':        ['A St', 'W 2nd St', 'Hillcrest Ave', 'Somersville Rd', 'Lone Tree Way', 'James Donlon Blvd', 'Deer Valley Rd', 'Buchanan Rd', 'G St', 'L St'],
  'San Ramon':      ['Bollinger Canyon Rd', 'Crow Canyon Rd', 'Alcosta Blvd', 'Dougherty Rd', 'Broadmoor Dr', 'Montevideo Dr', 'San Ramon Valley Blvd', 'Pine Valley Rd', 'Faria Preserve Pkwy', 'Norris Canyon Rd'],
  'Pittsburg':      ['Railroad Ave', 'E 3rd St', 'Harbor St', 'Black Diamond St', 'Central Ave', 'Buchanan Rd', 'Bailey Rd', 'Loveridge Rd', 'W Leland Rd', 'Parkside Dr'],
  'Martinez':       ['Main St', 'Estudillo St', 'Court St', 'Escobar St', 'Ferry St', 'Marina Vista Ave', 'Howe Rd', 'Alhambra Ave', 'Pine St', 'Ward St'],
  'Lafayette':      ['Mt Diablo Blvd', 'Moraga Rd', 'Happy Valley Rd', 'Deer Hill Rd', 'Pleasant Hill Rd', 'Olympic Blvd', 'Lafayette Cir', 'Dewing Ave', 'Brown Ave', 'Brook St'],
  // Marin
  'San Rafael':     ['4th St', 'Lincoln Ave', 'B St', 'Grand Ave', 'Mission Ave', 'Irwin St', 'E St', 'Tamalpais Ave', 'San Pedro Rd', 'Francisco Blvd'],
  'Novato':         ['Grant Ave', 'Novato Blvd', 'Diablo Ave', 'Redwood Blvd', 'S Novato Blvd', 'Rowland Blvd', 'Sweetser Ave', 'Simmons Ln', 'Wilson Ave', 'Olive Ave'],
  'Mill Valley':    ['Miller Ave', 'Throckmorton Ave', 'Montford Ave', 'Camino Alto', 'Sycamore Ave', 'Cascade Dr', 'Cornelia Ave', 'Ethel Ave', 'Willow St', 'Lovell Ave'],
  'Corte Madera':   ['Tamalpais Dr', 'Paradise Dr', 'Casa Buena Dr', 'Redwood Ave', 'Pixley Ave', 'Meadowsweet Dr', 'Fifer Ave', 'Lakeside Dr', 'Mohawk Ave', 'Montecito Dr'],
  'Tiburon':        ['Tiburon Blvd', 'Main St', 'Mar West St', 'Beach Rd', 'Paradise Dr', 'Lyford Dr', 'Reed Ranch Rd', 'Rock Hill Dr', 'Del Mar Dr', 'Avenida Miraflores'],
  'Sausalito':      ['Bridgeway', 'Caledonia St', 'Napa St', 'Princess St', 'Litho St', 'Bulkley Ave', 'Glen Dr', 'Harrison Ave', 'Spring St', 'Sunshine Ave'],
  // Sonoma
  'Santa Rosa':     ['4th St', 'Mendocino Ave', 'Sonoma Ave', 'College Ave', 'Bennett Valley Rd', 'Farmers Ln', 'Montgomery Dr', 'Guerneville Rd', 'W 3rd St', 'Sebastopol Rd'],
  'Petaluma':       ['Petaluma Blvd S', 'Kentucky St', 'Washington St', 'Western Ave', 'D St', 'Lakeville St', 'E Washington St', 'Keller St', 'Howard St', 'Bassett St'],
  'Rohnert Park':   ['Rohnert Park Expy', 'Commerce Blvd', 'Country Club Dr', 'Snyder Ln', 'Southwest Blvd', 'Roberts Lake Rd', 'Camino Colegio', 'Enterprise Dr', 'Martin Ave', 'Dowdell Ave'],
  'Sonoma':         ['W Napa St', 'Broadway', 'E Spain St', 'W Spain St', '1st St W', 'Patten St', 'Chase St', 'Andrieux St', 'Vallejo Ave', 'Mountain Ave'],
  'Windsor':        ['Windsor River Rd', 'Old Redwood Hwy', 'Shiloh Rd', 'Hembree Ln', 'McClelland Dr', 'Bell Rd', 'Vinecrest Rd', 'Skylane Blvd', 'Market St', 'Windsor Rd'],
  'Healdsburg':     ['Healdsburg Ave', 'Center St', 'Matheson St', 'Fitch St', 'Plaza St', 'University St', 'Piper St', 'Grant St', 'Powell Ave', 'Tucker St'],
  // Napa
  'Napa':           ['Main St', 'Jefferson St', 'Soscol Ave', 'Trancas St', 'Lincoln Ave', 'California Blvd', 'Imola Ave', 'Old Sonoma Rd', 'Pueblo Ave', 'Coombs St'],
  'American Canyon': ['Donaldson Way', 'Newell Dr', 'W American Canyon Rd', 'Rio Del Mar', 'Benton Way', 'James Rd', 'Kimberly Dr', 'Broadway St', 'Elliot Dr', 'Wetlands Edge Rd'],
  'St. Helena':     ['Main St', 'Adams St', 'Railroad Ave', 'Spring St', 'Hunt Ave', 'Madrona Ave', 'Crane Ave', 'Oak Ave', 'Church St', 'Pope St'],
  'Calistoga':      ['Lincoln Ave', 'Washington St', 'Cedar St', 'Fair Way', 'Foothill Blvd', 'Silverado Trail', 'Berry St', 'Spring St', 'Grant St', 'Myrtle St'],
  'Yountville':     ['Washington St', 'Yount St', 'Finnell Rd', 'Madison St', 'Yountville Cross Rd', 'Mulberry St', 'Webber Ave', 'California Dr', 'Humboldt St', 'Lincoln Ave'],
  // Solano
  'Vallejo':        ['Georgia St', 'Sonoma Blvd', 'Tennessee St', 'Marin St', 'Springs Rd', 'Tuolumne St', 'Sacramento St', 'Magazine St', 'Florida St', 'Nebraska St'],
  'Fairfield':      ['Texas St', 'N Texas St', 'Air Base Pkwy', 'W Texas St', 'Pennsylvania Ave', 'Union Ave', 'Tabor Ave', 'Jackson St', 'Kentucky St', 'Ohio St'],
  'Vacaville':      ['Main St', 'Merchant St', 'Davis St', 'Monte Vista Ave', 'E Monte Vista Ave', 'Depot St', 'Dobbins St', 'Buck Ave', 'Cernon St', 'Vine St'],
  'Benicia':        ['First St', 'Military West', 'E 2nd St', 'E 5th St', 'West K St', 'Rose Dr', 'Southampton Rd', 'Panorama Dr', 'Columbus Pkwy', 'Linda Ln'],
  'Suisun City':    ['Main St', 'Solano St', 'Lotz Way', 'Pintail Dr', 'Railroad Ave', 'Morgan St', 'Sunset Ave', 'Marina Blvd', 'Emperor Dr', 'Harrier Dr'],
  'Dixon':          ['N 1st St', 'W A St', 'S Jackson St', 'E Dorset Dr', 'N Lincoln St', 'W Cherry St', 'Pitt School Rd', 'Rehrmann Dr', 'Porter Rd', 'Valley Glen Dr'],
}

// Fallback generic streets (only used if city not found in CITY_STREETS)
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
  'Mary', 'Patricia', 'Elizabeth', 'Barbara', 'Michelle', 'Laura', 'Helen',
  'Donna', 'Ruth', 'Sharon', 'Carol', 'Angela', 'Brenda', 'Rachel',
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
  'Collins', 'Reyes', 'Stewart', 'Morris', 'Patel', 'Chen', 'Kim',
  'Wong', 'Singh', 'Chang', 'Shah', 'Tran', 'Kapoor', 'Yamamoto',
]

const PROPERTY_TYPES = [
  { type: 'SFR', weight: 70 },
  { type: 'Condo', weight: 15 },
  { type: 'Townhouse', weight: 10 },
  { type: 'Multi-Family', weight: 5 },
]

const BED_DISTRIBUTION = [
  { beds: 2, weight: 15 },
  { beds: 3, weight: 35 },
  { beds: 4, weight: 35 },
  { beds: 5, weight: 15 },
]

const SIGNAL_DEFS = [
  { type: 'absentee',       name: 'Absentee Owner',                    weight: 13, selectionWeight: 20 },
  { type: 'long_term_owner', name: 'Long-Term Ownership (20+ years)',  weight: 12, selectionWeight: 18 },
  { type: 'tax_delinquent', name: 'Tax Delinquent',                    weight: 9,  selectionWeight: 12 },
  { type: 'vacancy',        name: 'Vacancy Indicator',                 weight: 15, selectionWeight: 10 },
  { type: 'nod',            name: 'Notice of Default',                 weight: 7,  selectionWeight: 8 },
  { type: 'free_clear',     name: 'Free & Clear (No Mortgage)',        weight: 14, selectionWeight: 8 },
  { type: 'lis_pendens',    name: 'Lis Pendens Filing',                weight: 8,  selectionWeight: 6 },
  { type: 'executor_deed',  name: 'Executor/Administrator Deed',       weight: 11, selectionWeight: 5 },
  { type: 'quitclaim',      name: 'Quitclaim Transfer',                weight: 10, selectionWeight: 4 },
  { type: 'auction',        name: 'Foreclosure Auction',               weight: 7,  selectionWeight: 4 },
  { type: 'reo',            name: 'REO / Bank-Owned',                  weight: 6,  selectionWeight: 3 },
  { type: 'bankruptcy',     name: 'Bankruptcy Filing',                  weight: 8,  selectionWeight: 2 },
]

const WILDFIRE_RISK_WEIGHTED = [
  { value: 'Very Low', weight: 20 },
  { value: 'Low', weight: 60 },
  { value: 'Medium', weight: 15 },
  { value: 'High', weight: 5 },
]

const FLOOD_ZONE_WEIGHTED = [
  { value: 'Zone X', weight: 65 },
  { value: 'Zone AE', weight: 15 },
  { value: 'Zone A', weight: 10 },
  { value: 'Zone D', weight: 5 },
  { value: 'None', weight: 5 },
]

const ZONING_WEIGHTED = [
  { value: 'R1', weight: 50 },
  { value: 'R2', weight: 20 },
  { value: 'RM', weight: 15 },
  { value: 'PD', weight: 10 },
  { value: 'R3', weight: 5 },
]

const ENRICHMENT_SOURCES = ['batch_data', 'county_assessor', 'skip_trace', 'usps']

const OUT_OF_STATE_CITIES = [
  'Portland, OR 97201', 'Seattle, WA 98101', 'Phoenix, AZ 85001',
  'Las Vegas, NV 89101', 'Denver, CO 80201', 'Austin, TX 78701',
  'Chicago, IL 60601', 'New York, NY 10001', 'Miami, FL 33101',
  'Nashville, TN 37201', 'Atlanta, GA 30301', 'Salt Lake City, UT 84101',
  'Honolulu, HI 96801', 'Reno, NV 89501', 'Boise, ID 83701',
]

// City prestige tiers for value calculation
const PRESTIGE_TIER_1 = ['Palo Alto', 'Cupertino', 'Saratoga', 'Los Gatos', 'Menlo Park', 'Burlingame', 'Tiburon', 'Mill Valley', 'Sausalito', 'St. Helena', 'Calistoga', 'Healdsburg', 'Lafayette']
const PRESTIGE_TIER_2 = ['Mountain View', 'Sunnyvale', 'San Carlos', 'Foster City', 'Berkeley', 'Pleasanton', 'Campbell', 'San Mateo', 'San Rafael', 'Walnut Creek', 'San Ramon', 'Corte Madera', 'Novato', 'Napa', 'Petaluma', 'Sonoma', 'Yountville']
// Tier 3 (lowest): Hayward, Oakland, Daly City, etc. — everything else

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

function weightedPick<T extends { weight?: number; selectionWeight?: number }>(
  items: readonly T[],
  weightKey: 'weight' | 'selectionWeight' = 'weight'
): T {
  const total = items.reduce((s, i) => s + ((i as Record<string, number>)[weightKey] || 0), 0)
  let r = Math.random() * total
  for (const item of items) {
    r -= (item as Record<string, number>)[weightKey] || 0
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

/** Normal-ish distribution centered on mean with given stddev (Box-Muller) */
function normalRandom(mean: number, stddev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return Math.round(mean + z * stddev)
}

function computeCompleteness(lead: Record<string, unknown>): number {
  const fields = [
    'address', 'city', 'county', 'zip_code', 'apn',
    'latitude', 'longitude', 'property_type', 'beds', 'baths',
    'sqft_living', 'sqft_lot', 'year_built', 'assessed_value',
    'estimated_value', 'last_sale_date', 'last_sale_price',
    'owner_name', 'owner_phone', 'owner_email', 'mailing_address',
    'is_absentee', 'wildfire_risk', 'flood_zone', 'zoning',
  ]
  const filled = fields.filter(
    (f) => lead[f] != null && lead[f] !== ''
  ).length
  return Math.round((filled / fields.length) * 100) / 100
}

// Mirrors lib/scoring.ts logic exactly
function computeDistressScore(
  lead: Record<string, unknown>,
  signals: Array<{ signal_type: string; weight: number }>
): { score: number; priority: string } {
  let score = 0

  // Signal scoring (max 60 points)
  const signalWeights: Record<string, number> = {
    vacancy: 15, free_clear: 14, absentee: 13, long_term_owner: 12,
    executor_deed: 11, quitclaim: 10, tax_delinquent: 9,
    lis_pendens: 8, nod: 7, auction: 7, reo: 6,
    nts: 3, mechanic_lien: 3, bankruptcy: 8,
  }
  let signalScore = signals.reduce(
    (sum, s) => sum + (signalWeights[s.signal_type] || 5), 0
  )
  signalScore = Math.min(signalScore + Math.max(0, signals.length - 1) * 5, 60)
  score += signalScore

  // Property fit scoring (max 25 points)
  let fitScore = 0
  const ev = lead.estimated_value as number | null
  if (ev != null && ev >= 700000 && ev <= 3000000) {
    fitScore += ev <= 1500000 ? 8 : 5
  }
  const lot = lead.sqft_lot as number | null
  if (lot != null && lot >= 5000 && lot <= 10000) fitScore += 4
  const yb = lead.year_built as number | null
  if (yb != null && yb >= 1950 && yb <= 1980) fitScore += 4
  const lsd = lead.last_sale_date as string | null
  if (lsd) {
    const saleYear = new Date(lsd).getFullYear()
    if (saleYear < 2016) fitScore += 5
  }
  if (lead.has_garage) fitScore += 2
  const av = lead.assessed_value as number | null
  if (av != null && av >= 800000 && av <= 3000000) fitScore += 2
  score += Math.min(fitScore, 25)

  // Owner indicators (max 10 points)
  let ownerScore = 0
  if (lead.is_absentee) ownerScore += 5
  if (lead.is_out_of_state) ownerScore += 3
  const yo = lead.years_owned as number | null
  if (yo != null && yo >= 20) ownerScore += 2
  score += Math.min(ownerScore, 10)

  score = Math.max(0, Math.min(100, score))
  const priority = score >= 80 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'med' : 'low'
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
  // Use real streets for this city, fallback to generic
  const cityStreets = CITY_STREETS[city.name] || STREET_NAMES
  const streetNum = rand(100, 5999)
  const street = pick(cityStreets)
  const address = `${streetNum} ${street}`
  const zip = pick(city.zipCodes)

  // Tight jitter: ±0.005 (~500m) keeps points well within residential areas
  const lat = city.lat + randFloat(-0.005, 0.005)
  const lng = city.lng + randFloat(-0.005, 0.005)

  const apn = generateAPN(county.apnPrefix)

  const propType = weightedPick(PROPERTY_TYPES).type
  const beds = weightedPick(BED_DISTRIBUTION).beds

  // Baths: beds - random(0,1), min 1
  const bathsRaw = beds - rand(0, 1)
  const baths = Math.max(1, bathsRaw)

  // Sqft correlated with beds (exact ranges from spec)
  const sqftRanges: Record<number, [number, number]> = {
    2: [900, 1400],
    3: [1200, 2000],
    4: [1600, 2800],
    5: [2200, 3500],
  }
  const [sqftMin, sqftMax] = sqftRanges[beds] || [1200, 2000]
  const sqftLiving = rand(sqftMin, sqftMax)
  const sqftLot = propType === 'Condo' ? rand(800, 2500) : rand(2000, 15000)

  // Year built — normal-ish distribution centered on 1968
  let yearBuilt = normalRandom(1968, 15)
  yearBuilt = Math.max(1920, Math.min(2023, yearBuilt))

  const zoning = weightedPick(ZONING_WEIGHTED).value
  const hasGarage = Math.random() < 0.7

  // Value correlated with sqft and location (Palo Alto highest, Hayward lowest)
  let prestigeMultiplier: number
  if (PRESTIGE_TIER_1.includes(city.name)) {
    prestigeMultiplier = randFloat(1.3, 1.8)
  } else if (PRESTIGE_TIER_2.includes(city.name)) {
    prestigeMultiplier = randFloat(1.1, 1.4)
  } else {
    prestigeMultiplier = randFloat(0.75, 1.05)
  }

  // Assessed value: between 400000 and 2800000, correlated with sqft and location
  const rawAssessed = sqftLiving * randFloat(400, 900) * prestigeMultiplier
  const assessedValue = Math.max(400000, Math.min(2800000, Math.round(rawAssessed)))

  // Estimated value: assessed * random(1.1, 1.5)
  const estimatedValue = Math.round(assessedValue * randFloat(1.1, 1.5))

  // Last sale date: random between 2000-01-01 and 2024-12-31
  const saleYear = rand(2000, 2024)
  const saleMonth = rand(1, 12)
  const saleDay = rand(1, 28)
  const lastSaleDate = formatDate(new Date(saleYear, saleMonth - 1, saleDay))

  // Last sale price: estimated_value * random(0.55, 0.95)
  const lastSalePrice = Math.round(estimatedValue * randFloat(0.55, 0.95))

  // Owner
  const firstName = pick(FIRST_NAMES)
  const lastName = pick(LAST_NAMES)
  const ownerName = `${firstName} ${lastName}`

  const hasPhone = Math.random() < 0.65
  const hasEmail = Math.random() < 0.45
  const areaCodes = [408, 415, 510, 650, 669, 925]
  const ownerPhone = hasPhone
    ? `(${pick(areaCodes)}) ${rand(200, 999)}-${String(rand(1000, 9999))}`
    : null
  const emailDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'aol.com', 'hotmail.com', 'comcast.net']
  const ownerEmail = hasEmail
    ? `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${pick(emailDomains)}`
    : null

  // Absentee & out of state (out_of_state always implies absentee)
  const isOutOfState = Math.random() < 0.1
  const isAbsentee = isOutOfState || Math.random() < 0.3
  const isInstitutional = Math.random() < 0.03

  let mailingAddress: string
  if (isOutOfState) {
    const outCity = pick(OUT_OF_STATE_CITIES)
    mailingAddress = `${rand(100, 5999)} ${pick(STREET_NAMES)}, ${outCity}`
  } else if (isAbsentee) {
    const otherCity = pick(county.cities)
    const otherStreets = CITY_STREETS[otherCity.name] || STREET_NAMES
    mailingAddress = `${rand(100, 5999)} ${pick(otherStreets)}, ${otherCity.name}, CA ${pick(otherCity.zipCodes)}`
  } else {
    mailingAddress = `${address}, ${city.name}, CA ${zip}`
  }

  const currentYear = new Date().getFullYear()
  const yearsOwned = currentYear - saleYear

  // Equity percent: 20-95, higher for older ownership
  const baseEquity = 20 + yearsOwned * 2.8
  const equityPercent = Math.max(20, Math.min(95, Math.round(baseEquity + randFloat(-5, 10))))

  const wildfireRisk = weightedPick(WILDFIRE_RISK_WEIGHTED).value
  const floodZone = weightedPick(FLOOD_ZONE_WEIGHTED).value

  const leadObj: Record<string, unknown> = {
    address,
    city: city.name,
    county: county.name,
    zip_code: zip,
    apn,
    latitude: Math.round(lat * 10000) / 10000,
    longitude: Math.round(lng * 10000) / 10000,
    property_type: propType,
    beds,
    baths,
    sqft_living: sqftLiving,
    sqft_lot: sqftLot,
    year_built: yearBuilt,
    zoning,
    has_garage: hasGarage,
    assessed_value: assessedValue,
    estimated_value: estimatedValue,
    last_sale_date: lastSaleDate,
    last_sale_price: lastSalePrice,
    wildfire_risk: wildfireRisk,
    flood_zone: floodZone,
    owner_name: ownerName,
    owner_phone: ownerPhone,
    owner_email: ownerEmail,
    mailing_address: mailingAddress,
    is_absentee: isAbsentee,
    is_out_of_state: isOutOfState,
    is_institutional: isInstitutional,
    years_owned: yearsOwned,
    equity_percent: equityPercent,
    source: 'county_assessor',
  }

  const completeness = computeCompleteness(leadObj)

  return {
    ...leadObj,
    completeness,
    distress_score: 0,    // computed after signals
    upside_score: rand(10, 60),
    lead_priority: 'low', // computed after signals
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
  // Signal count distribution: 30% 0, 25% 1, 20% 2, 15% 3, 10% 4+
  const roll = Math.random()
  let count: number
  if (roll < 0.30)      count = 0
  else if (roll < 0.55) count = 1
  else if (roll < 0.75) count = 2
  else if (roll < 0.90) count = 3
  else                   count = rand(4, 6)

  if (count === 0) return []

  const usedTypes = new Set<string>()
  const signals: SignalRow[] = []

  for (let i = 0; i < count; i++) {
    let signalDef: typeof SIGNAL_DEFS[0]
    let attempts = 0
    do {
      signalDef = weightedPick(SIGNAL_DEFS, 'selectionWeight')
      attempts++
    } while (usedTypes.has(signalDef.type) && attempts < 30)

    if (usedTypes.has(signalDef.type)) continue
    usedTypes.add(signalDef.type)

    const daysAgo = rand(1, 365)
    const detectedAt = new Date(Date.now() - daysAgo * 86400000).toISOString()

    const signalSources: Record<string, string> = {
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
      bankruptcy: 'court_records',
    }

    signals.push({
      lead_id: leadId,
      name: signalDef.name,
      signal_type: signalDef.type,
      weight: signalDef.weight,
      detected_at: detectedAt,
      source: signalSources[signalDef.type] || 'system',
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

function generateEnrichmentLogs(leadId: number): EnrichmentLogRow[] {
  // ~50% of leads get enrichment logs
  if (Math.random() > 0.5) return []

  // 1-3 logs per lead
  const logCount = rand(1, 3)
  const logs: EnrichmentLogRow[] = []

  for (let i = 0; i < logCount; i++) {
    const source = pick(ENRICHMENT_SOURCES)

    const fieldOptions: Record<string, string[]> = {
      batch_data: ['owner_name', 'owner_phone', 'owner_email', 'mailing_address', 'estimated_value', 'property_type'],
      county_assessor: ['assessed_value', 'year_built', 'sqft_living', 'sqft_lot', 'beds', 'baths', 'zoning', 'apn'],
      skip_trace: ['owner_phone', 'owner_email', 'mailing_address', 'owner_name'],
      usps: ['is_absentee', 'mailing_address'],
    }

    const available = fieldOptions[source] || ['owner_name']
    const numFields = rand(1, Math.min(4, available.length))
    // Shuffle and pick
    const shuffled = [...available].sort(() => Math.random() - 0.5)
    const fieldsEnriched = shuffled.slice(0, numFields)

    const status = Math.random() < 0.85 ? 'success' : Math.random() < 0.7 ? 'partial' : 'failed'
    const duration = Math.round(randFloat(0.1, 5.0) * 100) / 100
    const daysAgo = rand(0, 120)
    const createdAt = new Date(Date.now() - daysAgo * 86400000).toISOString()

    logs.push({
      lead_id: leadId,
      source,
      status,
      fields_enriched: fieldsEnriched,
      duration,
      created_at: createdAt,
    })
  }

  return logs
}

// ---------------------------------------------------------------------------
// Batch Insert Helper
// ---------------------------------------------------------------------------

async function batchInsert(
  table: string,
  rows: Record<string, unknown>[],
  batchSize: number
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from(table).insert(chunk) as any)

    if (error) {
      // On unique constraint violation, try one-by-one
      if (error.code === '23505') {
        console.warn(`  WARN: Duplicate key in ${table} batch ${Math.floor(i / batchSize) + 1}, inserting individually...`)
        for (const row of chunk) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: singleErr } = await (supabase.from(table).insert(row) as any)
          if (singleErr) {
            if (singleErr.code === '23505') continue // skip duplicates silently
            console.error(`    ERROR: ${singleErr.message}`)
          }
        }
        continue
      }
      console.error(`  ERROR inserting into ${table} (batch ${Math.floor(i / batchSize) + 1}):`, error.message)
      throw error
    }
  }
}

// ---------------------------------------------------------------------------
// User Seeding with bcrypt
// ---------------------------------------------------------------------------

async function seedUsers(): Promise<void> {
  console.log('[0/7] Hashing passwords and seeding users...')

  const users = [
    { username: 'admin',  password: 'BaySentinel2026!', first_name: 'Admin',  email: 'admin@baysentinel.com',  role: 'admin',  is_admin_role: true },
    { username: 'nelson', password: 'SafariVentures!',  first_name: 'Nelson', email: 'nelson@baysentinel.com', role: 'viewer', is_admin_role: false },
  ]

  for (const user of users) {
    const passwordHash = await hash(user.password, 10)
    const { error } = await supabase
      .from('bs_users')
      .upsert(
        {
          username: user.username,
          password_hash: passwordHash,
          first_name: user.first_name,
          email: user.email,
          role: user.role,
          is_admin_role: user.is_admin_role,
        },
        { onConflict: 'username' }
      )

    if (error) {
      console.error(`  ERROR seeding user "${user.username}":`, error.message)
      throw error
    }
    console.log(`  User "${user.username}" seeded with bcrypt hash`)
  }
}

// ---------------------------------------------------------------------------
// Main Seed Function
// ---------------------------------------------------------------------------

async function seed(): Promise<void> {
  const startTime = Date.now()
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║        Bay Sentinel — Lead Seeder v2.0              ║')
  console.log('╚══════════════════════════════════════════════════════╝')
  console.log(`Target: ${COUNTIES.length} counties x ${LEADS_PER_COUNTY} leads = ${COUNTIES.length * LEADS_PER_COUNTY} leads`)
  console.log(`Database: ${supabaseUrl}`)
  console.log('')

  // Step 0: Seed users with properly hashed passwords
  await seedUsers()

  // Step 1: Generate all leads
  console.log('\n[1/7] Generating lead data...')
  const allLeads: LeadRow[] = []
  for (const county of COUNTIES) {
    for (let i = 0; i < LEADS_PER_COUNTY; i++) {
      allLeads.push(generateLead(county))
    }
    console.log(`  ${county.name}: ${LEADS_PER_COUNTY} leads generated`)
  }
  console.log(`  Total: ${allLeads.length} leads generated`)

  // Step 2: Clear existing data (optional — idempotent seeding)
  console.log('\n[2/7] Clearing existing seed data...')
  const { error: delSignals } = await supabase.from('bs_signals').delete().gte('id', 0)
  if (delSignals) console.warn(`  WARN: Could not clear signals: ${delSignals.message}`)
  const { error: delEnrich } = await supabase.from('bs_enrichment_logs').delete().gte('id', 0)
  if (delEnrich) console.warn(`  WARN: Could not clear enrichment_logs: ${delEnrich.message}`)
  const { error: delLeads } = await supabase.from('bs_leads').delete().gte('id', 0)
  if (delLeads) console.warn(`  WARN: Could not clear leads: ${delLeads.message}`)
  console.log('  Cleared existing leads, signals, and enrichment logs')

  // Step 3: Insert leads in batches of 50
  console.log('\n[3/7] Inserting leads into database...')
  const leadInsertStart = Date.now()
  const insertedLeadIds: number[] = []

  for (let i = 0; i < allLeads.length; i += LEAD_BATCH_SIZE) {
    const chunk = allLeads.slice(i, i + LEAD_BATCH_SIZE)
    const { data, error } = await supabase
      .from('bs_leads')
      .insert(chunk)
      .select('id')

    if (error) {
      if (error.code === '23505') {
        console.warn(`  WARN: Duplicates in batch ${Math.floor(i / LEAD_BATCH_SIZE) + 1}, inserting individually...`)
        for (const lead of chunk) {
          const { data: singleData, error: singleErr } = await supabase
            .from('bs_leads')
            .insert(lead)
            .select('id')
          if (singleErr) {
            if (singleErr.code === '23505') continue
            console.error(`    ERROR: ${singleErr.message}`)
          } else if (singleData) {
            insertedLeadIds.push(singleData[0].id)
          }
        }
        continue
      }
      console.error(`  ERROR inserting leads (batch ${Math.floor(i / LEAD_BATCH_SIZE) + 1}):`, error.message)
      throw error
    }

    if (data) {
      insertedLeadIds.push(...data.map((r: { id: number }) => r.id))
    }

    // Print progress every 50 leads
    const inserted = Math.min(i + chunk.length, allLeads.length)
    if (inserted % 50 === 0 || inserted === allLeads.length) {
      const pct = Math.round((inserted / allLeads.length) * 100)
      process.stdout.write(`  Progress: ${inserted}/${allLeads.length} (${pct}%)\r`)
    }
  }
  const leadInsertTime = ((Date.now() - leadInsertStart) / 1000).toFixed(1)
  console.log(`\n  Inserted ${insertedLeadIds.length} leads in ${leadInsertTime}s`)

  // Step 4: Generate and insert signals (~70% of leads get signals)
  console.log('\n[4/7] Generating and inserting signals...')
  const allSignals: SignalRow[] = []
  const leadSignalsMap = new Map<number, SignalRow[]>()
  let leadsWithSignals = 0

  for (const leadId of insertedLeadIds) {
    const signals = generateSignalsForLead(leadId)
    if (signals.length > 0) {
      allSignals.push(...signals)
      leadSignalsMap.set(leadId, signals)
      leadsWithSignals++
    }
  }

  console.log(`  Generated ${allSignals.length} signals for ${leadsWithSignals} leads (${Math.round((leadsWithSignals / insertedLeadIds.length) * 100)}% coverage)`)

  if (allSignals.length > 0) {
    const signalInsertStart = Date.now()
    // Insert signals in batches of 100
    for (let i = 0; i < allSignals.length; i += SIGNAL_BATCH_SIZE) {
      const chunk = allSignals.slice(i, i + SIGNAL_BATCH_SIZE)
      const { error } = await supabase.from('bs_signals').insert(chunk)
      if (error) {
        console.error(`  ERROR inserting signals (batch ${Math.floor(i / SIGNAL_BATCH_SIZE) + 1}):`, error.message)
        throw error
      }

      const inserted = Math.min(i + chunk.length, allSignals.length)
      if (inserted % 100 === 0 || inserted === allSignals.length) {
        process.stdout.write(`  Signals: ${inserted}/${allSignals.length}\r`)
      }
    }
    const signalInsertTime = ((Date.now() - signalInsertStart) / 1000).toFixed(1)
    console.log(`\n  Inserted ${allSignals.length} signals in ${signalInsertTime}s`)
  }

  // Step 5: Compute distress scores and update leads
  console.log('\n[5/7] Computing distress scores...')
  const scoreStart = Date.now()

  interface ScoreUpdate {
    id: number
    distress_score: number
    lead_priority: string
    completeness: number
  }

  const scoreUpdates: ScoreUpdate[] = []

  for (let idx = 0; idx < insertedLeadIds.length; idx++) {
    const leadId = insertedLeadIds[idx]
    const leadData = allLeads[idx]
    const signals = leadSignalsMap.get(leadId) || []

    const { score, priority } = computeDistressScore(
      leadData as unknown as Record<string, unknown>,
      signals.map(s => ({ signal_type: s.signal_type, weight: s.weight }))
    )

    scoreUpdates.push({
      id: leadId,
      distress_score: score,
      lead_priority: priority,
      completeness: leadData.completeness,
    })
  }

  // Update scores in parallel batches
  let scoreUpdateErrors = 0
  for (let i = 0; i < scoreUpdates.length; i += LEAD_BATCH_SIZE) {
    const chunk = scoreUpdates.slice(i, i + LEAD_BATCH_SIZE)
    const promises = chunk.map((update) =>
      supabase
        .from('bs_leads')
        .update({
          distress_score: update.distress_score,
          lead_priority: update.lead_priority,
          completeness: update.completeness,
        })
        .eq('id', update.id)
    )
    const results = await Promise.all(promises)
    scoreUpdateErrors += results.filter((r) => r.error).length

    const updated = Math.min(i + chunk.length, scoreUpdates.length)
    if (updated % 50 === 0 || updated === scoreUpdates.length) {
      process.stdout.write(`  Scores: ${updated}/${scoreUpdates.length}\r`)
    }
  }

  const scoreTime = ((Date.now() - scoreStart) / 1000).toFixed(1)

  // Score distribution
  const critical = scoreUpdates.filter((u) => u.lead_priority === 'critical').length
  const high = scoreUpdates.filter((u) => u.lead_priority === 'high').length
  const med = scoreUpdates.filter((u) => u.lead_priority === 'med').length
  const low = scoreUpdates.filter((u) => u.lead_priority === 'low').length
  const avgScore = Math.round(scoreUpdates.reduce((sum, u) => sum + u.distress_score, 0) / scoreUpdates.length)

  console.log(`\n  Updated ${scoreUpdates.length} scores in ${scoreTime}s${scoreUpdateErrors > 0 ? ` (${scoreUpdateErrors} errors)` : ''}`)
  console.log(`  Distribution: Critical=${critical} | High=${high} | Med=${med} | Low=${low}`)
  console.log(`  Average score: ${avgScore}`)

  // Step 6: Generate and insert enrichment logs (~50% of leads, 1-3 each)
  console.log('\n[6/7] Generating enrichment logs...')
  const allEnrichmentLogs: EnrichmentLogRow[] = []

  for (const leadId of insertedLeadIds) {
    const logs = generateEnrichmentLogs(leadId)
    allEnrichmentLogs.push(...logs)
  }

  console.log(`  Generated ${allEnrichmentLogs.length} enrichment logs`)

  if (allEnrichmentLogs.length > 0) {
    const enrichStart = Date.now()
    await batchInsert(
      'bs_enrichment_logs',
      allEnrichmentLogs as unknown as Record<string, unknown>[],
      SIGNAL_BATCH_SIZE
    )
    const enrichTime = ((Date.now() - enrichStart) / 1000).toFixed(1)
    console.log(`  Inserted ${allEnrichmentLogs.length} enrichment logs in ${enrichTime}s`)
  }

  // Step 7: Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log('\n[7/7] Verifying...')

  // Quick verification counts
  const { count: leadCount } = await supabase.from('bs_leads').select('*', { count: 'exact', head: true })
  const { count: signalCount } = await supabase.from('bs_signals').select('*', { count: 'exact', head: true })
  const { count: enrichCount } = await supabase.from('bs_enrichment_logs').select('*', { count: 'exact', head: true })

  console.log('')
  console.log('╔══════════════════════════════════════════════════════╗')
  console.log('║                  SEED COMPLETE                      ║')
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log(`║  Users:            2 (admin, nelson)                ║`)
  console.log(`║  Leads:            ${String(leadCount ?? insertedLeadIds.length).padEnd(37)}║`)
  console.log(`║  Signals:          ${String(signalCount ?? allSignals.length).padEnd(37)}║`)
  console.log(`║  Enrichment Logs:  ${String(enrichCount ?? allEnrichmentLogs.length).padEnd(37)}║`)
  console.log(`║  Time:             ${(elapsed + 's').padEnd(37)}║`)
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log('║  Score Distribution:                                ║')
  console.log(`║    Critical (80+):  ${String(critical).padEnd(36)}║`)
  console.log(`║    High (50-79):    ${String(high).padEnd(36)}║`)
  console.log(`║    Med (25-49):     ${String(med).padEnd(36)}║`)
  console.log(`║    Low (0-24):      ${String(low).padEnd(36)}║`)
  console.log(`║    Average:         ${String(avgScore).padEnd(36)}║`)
  console.log('╠══════════════════════════════════════════════════════╣')
  console.log(`║  Counties: ${COUNTIES.map(c => c.name).join(', ').padEnd(44)}║`)
  console.log('╚══════════════════════════════════════════════════════╝')
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
