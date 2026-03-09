import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

interface Signal {
  name: string
  weight: number
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
      .from('leads')
      .select('*, signals(name, weight), enrichment_logs(source, status, fields_enriched, duration, created_at)')
      .eq('id', id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { error: 'Lead not found' },
        { status: 404 }
      )
    }

    const { signals, enrichment_logs, ...leadFields } = data as Record<string, unknown>

    const active_signals = (Array.isArray(signals) ? signals : []).map(
      (s: Signal) => ({
        name: s.name,
        weight: s.weight,
      })
    )

    const enrichment = (Array.isArray(enrichment_logs) ? enrichment_logs : []).map(
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
