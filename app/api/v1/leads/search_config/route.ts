import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

const BAY_AREA_COUNTIES = [
  'Santa Clara',
  'San Mateo',
  'Alameda',
]

const PROPERTY_TYPES = ['SFR', 'Condo', 'Townhouse', 'Multi-Family']

const WILDFIRE_OPTIONS = ['Very Low', 'Low', 'Medium', 'High']

const FLOOD_OPTIONS = ['Zone X', 'Zone AE', 'Zone A', 'Zone D', 'None']

const SIGNAL_TYPES = [
  'absentee',
  'long_term_owner',
  'tax_delinquent',
  'vacancy',
  'nod',
  'free_clear',
  'lis_pendens',
  'executor_deed',
  'quitclaim',
  'auction',
  'reo',
  'bankruptcy',
]

const PRIORITIES = [
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'med', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'dismissed', label: 'Dismissed' },
]

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const config = {
      filters: {
        location: [
          {
            key: 'county',
            label: 'County',
            type: 'select',
            options: BAY_AREA_COUNTIES,
          },
        ],
        scores: [
          {
            key: 'lead_priority',
            label: 'Priority',
            type: 'select',
            options: ['critical', 'high', 'med', 'low'],
          },
          {
            key: 'min_score',
            label: 'Min Score',
            type: 'number',
            min: 0,
            max: 100,
          },
          {
            key: 'max_score',
            label: 'Max Score',
            type: 'number',
            min: 0,
            max: 100,
          },
        ],
        financial: [
          { key: 'min_value', label: 'Min Value', type: 'number' },
          { key: 'max_value', label: 'Max Value', type: 'number' },
        ],
        property: [
          {
            key: 'property_type',
            label: 'Type',
            type: 'select',
            options: PROPERTY_TYPES,
          },
          { key: 'beds', label: 'Beds', type: 'number', min: 1, max: 10 },
          { key: 'baths', label: 'Baths', type: 'number', min: 1, max: 8 },
          { key: 'min_sqft', label: 'Min SqFt', type: 'number' },
          { key: 'max_sqft', label: 'Max SqFt', type: 'number' },
          {
            key: 'min_year',
            label: 'Year Min',
            type: 'number',
            min: 1900,
            max: 2026,
          },
          {
            key: 'max_year',
            label: 'Year Max',
            type: 'number',
            min: 1900,
            max: 2026,
          },
        ],
        owner: [
          { key: 'is_absentee', label: 'Absentee', type: 'bool' },
          { key: 'is_out_of_state', label: 'Out of State', type: 'bool' },
          {
            key: 'min_years_owned',
            label: 'Min Years Owned',
            type: 'number',
          },
        ],
        signals: [
          {
            key: 'signal_type',
            label: 'Signal Type',
            type: 'select',
            options: SIGNAL_TYPES,
          },
        ],
        hazard: [
          {
            key: 'wildfire_risk',
            label: 'Wildfire Risk',
            type: 'select',
            options: WILDFIRE_OPTIONS,
          },
          {
            key: 'flood_zone',
            label: 'Flood Zone',
            type: 'select',
            options: FLOOD_OPTIONS,
          },
        ],
        quality: [
          {
            key: 'min_completeness',
            label: 'Min Completeness %',
            type: 'number',
            min: 0,
            max: 100,
          },
        ],
        dates: [
          { key: 'created_after', label: 'Created After', type: 'date' },
          { key: 'created_before', label: 'Created Before', type: 'date' },
        ],
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
