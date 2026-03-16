import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { computeDistressScore, computeCompleteness } from '@/lib/scoring'

const BATCH_SIZE = 500

export async function POST(request: NextRequest) {
  try {
    await requireAdmin(request)

    let updated = 0
    let offset = 0
    let hasMore = true

    while (hasMore) {
      const { data: leads, error } = await supabase
        .from('bs_leads')
        .select('id, estimated_value, assessed_value, sqft_lot, year_built, last_sale_date, has_garage, is_absentee, is_out_of_state, years_owned, is_mls_listed, address, city, county, zip_code, apn, latitude, longitude, property_type, beds, baths, sqft_living, last_sale_price, owner_name, owner_phone, owner_email, mailing_address, wildfire_risk, flood_zone')
        .range(offset, offset + BATCH_SIZE - 1)

      if (error) {
        return NextResponse.json(
          { error: 'Failed to fetch leads', detail: error.message },
          { status: 500 }
        )
      }

      if (!leads || leads.length === 0) {
        hasMore = false
        break
      }

      // Fetch signals for this batch
      const leadIds = leads.map((l) => l.id)
      const { data: allSignals } = await supabase
        .from('bs_signals')
        .select('lead_id, signal_type, weight')
        .in('lead_id', leadIds)

      const signalsByLead: Record<number, { signal_type: string; weight: number }[]> = {}
      for (const s of allSignals || []) {
        const lid = s.lead_id as number
        if (!signalsByLead[lid]) signalsByLead[lid] = []
        signalsByLead[lid].push({ signal_type: s.signal_type, weight: s.weight })
      }

      // Compute scores and batch update
      for (const lead of leads) {
        const signals = signalsByLead[lead.id as number] || []
        const { score, priority } = computeDistressScore(lead, signals)
        const completeness = computeCompleteness(lead as Record<string, unknown>)

        const { error: updateErr } = await supabase
          .from('bs_leads')
          .update({
            distress_score: score,
            lead_priority: priority,
            completeness,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id)

        if (!updateErr) updated++
      }

      offset += BATCH_SIZE
      if (leads.length < BATCH_SIZE) hasMore = false
    }

    return NextResponse.json({ status: 'ok', updated })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
