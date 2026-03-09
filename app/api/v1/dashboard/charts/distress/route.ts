import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)
  } catch (res: unknown) {
    if (res instanceof Response) {
      const body = await res.json()
      return NextResponse.json(body, { status: res.status })
    }
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  try {
    const { data, error } = await supabase
      .from('leads')
      .select('distress_score')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const buckets = Array(10).fill(0) as number[]

    data?.forEach((lead) => {
      const score = lead.distress_score ?? 0
      const idx = Math.min(Math.floor(score / 10), 9)
      buckets[idx]++
    })

    const labels = [
      '0-10', '10-20', '20-30', '30-40', '40-50',
      '50-60', '60-70', '70-80', '80-90', '90-100',
    ]

    return NextResponse.json({ labels, values: buckets })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
