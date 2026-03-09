import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAdmin(request)

    const { id } = await params

    // Fetch current state
    const { data: scraper, error: fetchError } = await supabase
      .from('bs_scrapers')
      .select('id, active')
      .eq('id', id)
      .single()

    if (fetchError || !scraper) {
      return NextResponse.json(
        { error: 'Scraper not found' },
        { status: 404 }
      )
    }

    const newActive = !scraper.active

    const { error: updateError } = await supabase
      .from('bs_scrapers')
      .update({ active: newActive })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to toggle scraper', detail: updateError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ active: newActive })
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
