/** Shared types for the Bay Sentinel scraper system */

export interface ScraperStep {
  name: string
  detail: string
  status: 'pending' | 'running' | 'success' | 'failed'
  records: number
}

export interface ScraperResult {
  leads_created: number
  leads_updated: number
  leads_enriched: number
  leads_failed: number
  steps: ScraperStep[]
}

export interface OperationContext {
  opId: number
  county?: string
  days?: number
}

/** Property data from external source or county records */
export interface PropertyRecord {
  apn: string
  county: string
  address?: string
  city?: string
  zip_code?: string
  property_type?: string
  beds?: number
  baths?: number
  sqft_living?: number
  sqft_lot?: number
  year_built?: number
  has_garage?: boolean
  assessed_value?: number
  estimated_value?: number
  last_sale_date?: string
  last_sale_price?: number
  owner_name?: string
  mailing_address?: string
  owner_phone?: string
  owner_email?: string
  latitude?: number
  longitude?: number
  zoning?: string
}

/** Signal detected from public records */
export interface SignalRecord {
  lead_id?: string
  apn: string
  county: string
  signal_type: string
  name: string
  weight: number
  source: string
  detected_at: string
}

/** BatchData API response for property lookup */
export interface BatchDataPropertyResponse {
  results?: {
    property?: {
      apn?: string
      address?: { full?: string; city?: string; zip?: string; state?: string }
      characteristics?: {
        bedrooms?: number
        bathrooms?: number
        livingArea?: number
        lotSize?: number
        yearBuilt?: number
        garage?: boolean
        propertyType?: string
      }
      tax?: {
        assessedValue?: number
        taxAmount?: number
        delinquent?: boolean
      }
      valuation?: {
        estimatedValue?: number
      }
      sale?: {
        date?: string
        price?: number
      }
      owner?: {
        name?: string
        mailingAddress?: string
        phone?: string
        email?: string
      }
      foreclosure?: {
        status?: string
        nodDate?: string
        ntsDate?: string
        auctionDate?: string
      }
    }
  }[]
}

/** Valid counties for Bay Sentinel */
export const VALID_COUNTIES = ['santa_clara', 'san_mateo', 'alameda'] as const
export type County = (typeof VALID_COUNTIES)[number]

export const COUNTY_LABELS: Record<County, string> = {
  santa_clara: 'Santa Clara',
  san_mateo: 'San Mateo',
  alameda: 'Alameda',
}

/** Signal weights matching the developer scope document (Section 3) */
export const SIGNAL_WEIGHTS: Record<string, number> = {
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
  nts: 4,
  mechanic_lien: 3,
  auction: 5,
  bankruptcy: 8,
}
