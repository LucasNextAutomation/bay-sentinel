import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { workerHealth } from '@/lib/worker'

const startedAt = new Date().toISOString()

export async function GET() {
  const checks: Record<string, string> = {}

  // Database connectivity
  try {
    const { count, error } = await supabase
      .from('bs_leads')
      .select('id', { count: 'exact', head: true })

    if (error) {
      checks.database = `error: ${error.message}`
    } else {
      checks.database = `ok (${count} leads)`
    }
  } catch {
    checks.database = 'unreachable'
  }

  // Config check (optional — table may not exist in minimal setup)
  try {
    const { data } = await supabase
      .from('bs_app_config')
      .select('key')
    const keys = (data || []).map((r: { key: string }) => r.key)
    checks.config = keys.length ? `ok (${keys.length} keys)` : 'ok (empty)'
  } catch {
    checks.config = 'skip (table missing)'
  }

  // Python worker (optional)
  try {
    const w = await workerHealth()
    checks.worker = w.ok ? `ok (${w.status ?? 'live'})` : (w.error ?? 'unreachable')
  } catch {
    checks.worker = 'skip'
  }

  // Environment
  checks.jwt_secret = process.env.JWT_SECRET ? 'configured' : 'MISSING'
  checks.supabase_url = process.env.SUPABASE_URL ? 'configured' : 'MISSING'

  const allOk = checks.database.startsWith('ok') &&
    checks.jwt_secret === 'configured' &&
    checks.supabase_url === 'configured'

  return NextResponse.json({
    status: allOk ? 'healthy' : 'degraded',
    started_at: startedAt,
    checked_at: new Date().toISOString(),
    checks,
  }, { status: allOk ? 200 : 503 })
}
