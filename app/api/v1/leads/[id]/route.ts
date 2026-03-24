import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

interface Signal {
  name: string | null
  weight: number
  signal_type: string
}

interface EnrichmentLog {
  source: string
  status: string
  fields_enriched: string[] | null
  duration: number | null
  created_at: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(request)

    const { id } = await params

    const { data, error } = await supabase
      .from('bs_leads')
      .select('*, bs_signals(name, weight, signal_type), bs_enrichment_logs(source, status, fields_enriched, duration, created_at)')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const { bs_signals, bs_enrichment_logs, ...leadFields } = data as Record<string, unknown>

    const active_signals = (Array.isArray(bs_signals) ? bs_signals : []).map(
      (s: Signal) => ({
        name: s.name || s.signal_type || 'Signal',
        weight: s.weight,
        signal_type: s.signal_type,
      })
    )

    const enrichment = (Array.isArray(bs_enrichment_logs) ? bs_enrichment_logs : []).map(
      (e: EnrichmentLog) => ({
        source: e.source,
        status: e.status,
        fields: e.fields_enriched,
        duration: e.duration,
        at: e.created_at,
      })
    )

    return NextResponse.json({
      ...leadFields,
      active_signals,
      enrichment_logs: enrichment,
    })
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
