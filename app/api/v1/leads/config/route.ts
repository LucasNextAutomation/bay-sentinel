import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAuth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request)

    const { data, error } = await supabase
      .from('bs_app_config')
      .select('key, value')

    const config: Record<string, string> = {}
    if (!error && data) {
      for (const row of data) {
        config[row.key] = row.value
      }
    }

    // Only expose client-safe keys (defaults if table missing)
    const countiesStr = config.contracted_counties || 'Santa Clara,San Mateo,Alameda'
    const counties = countiesStr.split(',').map((c: string) => c.trim())

    return NextResponse.json({
      google_maps_key: config.google_maps_key || '',
      default_county: config.default_county || 'Santa Clara',
      counties,
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
