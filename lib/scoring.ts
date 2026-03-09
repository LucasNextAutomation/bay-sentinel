export interface LeadForScoring {
  estimated_value?: number | null
  assessed_value?: number | null
  sqft_lot?: number | null
  year_built?: number | null
  last_sale_date?: string | null
  has_garage?: boolean | null
  is_absentee?: boolean | null
  is_out_of_state?: boolean | null
  years_owned?: number | null
  is_mls_listed?: boolean | null
}

export interface Signal {
  signal_type: string
  weight: number
}

export function computeDistressScore(
  lead: LeadForScoring,
  signals: Signal[]
): { score: number; priority: string } {
  let score = 0

  // SIGNAL SCORING (60% weight)
  const signalWeights: Record<string, number> = {
    vacancy: 15,
    free_clear: 14,
    absentee: 13,
    long_term_owner: 12,
    executor_deed: 11,
    quitclaim: 10,
    tax_delinquent: 9,
    lis_pendens: 8,
    nod: 7,
    reo: 6,
    nts: 3,
    mechanic_lien: 3,
    auction: 7,
    bankruptcy: 8,
  }

  let signalScore = signals.reduce(
    (sum, s) => sum + (signalWeights[s.signal_type] || 5),
    0
  )
  // Signal stacking bonus
  const stackingBonus = Math.max(0, signals.length - 1) * 5
  signalScore = Math.min(signalScore + stackingBonus, 60)
  score += signalScore

  // PROPERTY FIT (25% weight)
  let fitScore = 0
  if (lead.estimated_value) {
    if (lead.estimated_value >= 700000 && lead.estimated_value <= 3000000) {
      fitScore += lead.estimated_value <= 1500000 ? 8 : 5
    }
  }
  if (lead.sqft_lot && lead.sqft_lot >= 5000 && lead.sqft_lot <= 10000) {
    fitScore += 4
  }
  if (lead.year_built && lead.year_built >= 1950 && lead.year_built <= 1980) {
    fitScore += 4
  }
  if (lead.last_sale_date) {
    const saleYear = new Date(lead.last_sale_date).getFullYear()
    if (saleYear < 2016) fitScore += 5
  }
  if (lead.has_garage) fitScore += 2
  if (
    lead.assessed_value &&
    lead.assessed_value >= 800000 &&
    lead.assessed_value <= 3000000
  ) {
    fitScore += 2
  }
  score += Math.min(fitScore, 25)

  // OWNER INDICATORS (10% weight)
  let ownerScore = 0
  if (lead.is_absentee) ownerScore += 5
  if (lead.is_out_of_state) ownerScore += 3
  if (lead.years_owned && lead.years_owned >= 20) ownerScore += 2
  score += Math.min(ownerScore, 10)

  // MLS PENALTY
  if (lead.is_mls_listed) score -= 10

  score = Math.max(0, Math.min(100, score))

  let priority: string
  if (score >= 80) priority = 'critical'
  else if (score >= 50) priority = 'high'
  else if (score >= 25) priority = 'med'
  else priority = 'low'

  return { score, priority }
}

// Compute completeness based on how many fields are filled
export function computeCompleteness(lead: Record<string, unknown>): number {
  const fields = [
    'address',
    'city',
    'county',
    'zip_code',
    'apn',
    'latitude',
    'longitude',
    'property_type',
    'beds',
    'baths',
    'sqft_living',
    'sqft_lot',
    'year_built',
    'assessed_value',
    'estimated_value',
    'last_sale_date',
    'last_sale_price',
    'owner_name',
    'owner_phone',
    'owner_email',
    'mailing_address',
    'is_absentee',
    'wildfire_risk',
    'flood_zone',
  ]
  const filled = fields.filter(
    (f) => lead[f] != null && lead[f] !== ''
  ).length
  return Math.round((filled / fields.length) * 100) / 100
}
