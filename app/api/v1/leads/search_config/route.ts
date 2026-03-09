import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const BAY_AREA_COUNTIES = [
  'Alameda',
  'Contra Costa',
  'Marin',
  'Napa',
  'San Francisco',
  'San Mateo',
  'Santa Clara',
  'Solano',
  'Sonoma',
]

const PROPERTY_TYPES = ['SFR', 'Condo', 'Townhouse', 'Multi-Family', 'Vacant Land']

const WILDFIRE_OPTIONS = ['High', 'Medium', 'Low', 'Very Low', 'None']

const FLOOD_OPTIONS = ['Zone A', 'Zone AE', 'Zone X', 'Zone D']

const PRIORITIES = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'dead', label: 'Dead' },
]

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'under_contract', label: 'Under Contract' },
  { value: 'closed', label: 'Closed' },
  { value: 'lost', label: 'Lost' },
]

const SIGNAL_TYPES = ['nod', 'auction', 'tax_delinquent', 'vacancy', 'absentee']

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const config = {
      sections: {
        location: {
          county: { type: 'select', options: BAY_AREA_COUNTIES },
          city: { type: 'text' },
          zip_code: { type: 'text' },
        },
        scores: {
          min_distress: { type: 'number', min: 0, max: 100 },
          max_distress: { type: 'number', min: 0, max: 100 },
          min_upside: { type: 'number', min: 0, max: 100 },
          priority: { type: 'select', options: PRIORITIES.map((p) => p.value) },
        },
        financial: {
          min_value: { type: 'number' },
          max_value: { type: 'number' },
          min_equity: { type: 'number', min: 0, max: 100 },
          max_equity: { type: 'number', min: 0, max: 100 },
        },
        property: {
          property_type: { type: 'select', options: PROPERTY_TYPES },
          min_beds: { type: 'number', min: 0, max: 10 },
          max_beds: { type: 'number', min: 0, max: 10 },
          min_sqft: { type: 'number' },
          max_sqft: { type: 'number' },
          min_year: { type: 'number', min: 1900, max: 2026 },
          max_year: { type: 'number', min: 1900, max: 2026 },
        },
        owner: {
          is_absentee: { type: 'bool' },
          is_out_of_state: { type: 'bool' },
          is_institutional: { type: 'bool' },
          min_years_owned: { type: 'number', min: 0, max: 50 },
        },
        signals: {
          signal_type: { type: 'select', options: SIGNAL_TYPES },
          has_nod: { type: 'bool' },
          has_auction: { type: 'bool' },
        },
        hazard: {
          wildfire_risk: { type: 'select', options: WILDFIRE_OPTIONS },
          flood_zone: { type: 'select', options: FLOOD_OPTIONS },
        },
        quality: {
          min_completeness: { type: 'number', min: 0, max: 1 },
        },
        dates: {
          created_after: { type: 'date' },
          created_before: { type: 'date' },
        },
      },
      counties: BAY_AREA_COUNTIES,
      property_types: PROPERTY_TYPES,
      wildfire_options: WILDFIRE_OPTIONS,
      flood_options: FLOOD_OPTIONS,
      priorities: PRIORITIES,
      statuses: STATUSES,
    }

    return NextResponse.json(config)
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
