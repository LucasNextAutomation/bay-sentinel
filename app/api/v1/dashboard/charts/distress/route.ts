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
    // Fetch in batches of 1000 to overcome Supabase row limit
    const allData: { distress_score: number | null }[] = []
    for (let offset = 0; offset < 5000; offset += 1000) {
      const { data: batch, error: batchError } = await supabase
        .from('bs_leads')
        .select('distress_score')
        .range(offset, offset + 999)
      if (batchError) {
        return NextResponse.json({ error: batchError.message }, { status: 500 })
      }
      if (!batch || batch.length === 0) break
      allData.push(...batch)
    }

    const buckets = Array(10).fill(0) as number[]

    allData.forEach((lead) => {
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
