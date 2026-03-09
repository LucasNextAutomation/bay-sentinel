import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { data, error } = await supabase
      .from('bs_app_config')
      .select('key, value')

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch app config', detail: error.message },
        { status: 500 }
      )
    }

    // Build config object from key-value rows
    const config: Record<string, string> = {}
    for (const row of data || []) {
      config[row.key] = row.value
    }

    // Only expose client-safe keys
    return NextResponse.json({
      google_maps_key: config.google_maps_key || '',
      default_county: config.default_county || 'Santa Clara',
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
