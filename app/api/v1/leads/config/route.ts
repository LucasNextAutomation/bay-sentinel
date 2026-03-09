import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { data, error } = await supabase
      .from('bs_app_config')
      .select('value')
      .eq('key', 'google_maps_key')
      .single()

    if (error || !data) {
      return NextResponse.json(
        { google_maps_key: '' }
      )
    }

    return NextResponse.json({
      google_maps_key: data.value,
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
