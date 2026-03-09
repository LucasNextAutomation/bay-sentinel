/* eslint-disable @typescript-eslint/no-explicit-any */

const ALLOWED_ORDER_FIELDS = new Set([
  'distress_score', 'estimated_value', 'assessed_value', 'created_at',
  'updated_at', 'year_built', 'beds', 'baths', 'sqft_living', 'sqft_lot',
  'county', 'lead_priority', 'completeness', 'equity_percent', 'years_owned',
])

export function applyFilters(
  query: any,
  params: URLSearchParams
): any {
  const county = params.get('county')
  if (county) query = query.eq('county', county)

  const priority = params.get('priority')
  if (priority) query = query.eq('lead_priority', priority)

  const minDistress = params.get('min_distress')
  if (minDistress) query = query.gte('distress_score', parseInt(minDistress))

  const maxDistress = params.get('max_distress')
  if (maxDistress) query = query.lte('distress_score', parseInt(maxDistress))

  // Financial
  const minValue = params.get('min_value')
  if (minValue) query = query.gte('estimated_value', parseFloat(minValue))
  const maxValue = params.get('max_value')
  if (maxValue) query = query.lte('estimated_value', parseFloat(maxValue))

  // Property
  const propertyType = params.get('property_type')
  if (propertyType) query = query.eq('property_type', propertyType)
  const minBeds = params.get('min_beds')
  if (minBeds) query = query.gte('beds', parseInt(minBeds))
  const maxBeds = params.get('max_beds')
  if (maxBeds) query = query.lte('beds', parseInt(maxBeds))
  const minSqft = params.get('min_sqft')
  if (minSqft) query = query.gte('sqft_living', parseInt(minSqft))
  const maxSqft = params.get('max_sqft')
  if (maxSqft) query = query.lte('sqft_living', parseInt(maxSqft))
  const minYear = params.get('min_year')
  if (minYear) query = query.gte('year_built', parseInt(minYear))
  const maxYear = params.get('max_year')
  if (maxYear) query = query.lte('year_built', parseInt(maxYear))

  // Owner
  const isAbsentee = params.get('is_absentee')
  if (isAbsentee === 'true') query = query.eq('is_absentee', true)
  const isOutOfState = params.get('is_out_of_state')
  if (isOutOfState === 'true') query = query.eq('is_out_of_state', true)
  const minYearsOwned = params.get('min_years_owned')
  if (minYearsOwned) query = query.gte('years_owned', parseInt(minYearsOwned))

  // Hazard
  const wildfireRisk = params.get('wildfire_risk')
  if (wildfireRisk) query = query.eq('wildfire_risk', wildfireRisk)
  const floodZone = params.get('flood_zone')
  if (floodZone) query = query.eq('flood_zone', floodZone)

  // Quality
  const minCompleteness = params.get('min_completeness')
  if (minCompleteness)
    query = query.gte('completeness', parseFloat(minCompleteness))

  // Dates
  const createdAfter = params.get('created_after')
  if (createdAfter) query = query.gte('created_at', createdAfter)
  const createdBefore = params.get('created_before')
  if (createdBefore) query = query.lte('created_at', createdBefore)

  // Ordering with allowlist
  const ordering = params.get('ordering')
  if (ordering) {
    const desc = ordering.startsWith('-')
    const field = desc ? ordering.slice(1) : ordering
    if (ALLOWED_ORDER_FIELDS.has(field)) {
      query = query.order(field, { ascending: !desc })
    } else {
      query = query.order('distress_score', { ascending: false })
    }
  } else {
    query = query.order('distress_score', { ascending: false })
  }

  return query
}

export function buildFilterQuery(params: URLSearchParams): string {
  const filters: string[] = []
  params.forEach((value, key) => {
    if (key !== 'page' && key !== 'ordering' && value) {
      filters.push(`${key}=${encodeURIComponent(value)}`)
    }
  })
  return filters.join('&')
}
