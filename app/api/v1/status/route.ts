import { NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'
import { workerHealth } from '@/lib/worker'

interface OperationRow {
  operation_key: string
  status: string
  started_at: string
  completed_at: string | null
  leads_created: number
  leads_updated: number
  leads_enriched: number
  leads_failed: number
}

interface ConfigRow {
  key: string
  value: string
  updated_at: string
}

interface EnrichmentLogRow {
  source: string
  status: string
  day: string
}

export async function GET(request: Request) {
  try {
    await requireAdmin(request)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  const now = new Date()
  const todayKey = now.toISOString().slice(0, 10).replace(/-/g, '')

  try {
    // Run all queries in parallel
    const [
      leadsResult,
      operationsResult,
      configResult,
      enrichmentLogsResult,
      signalCountResult,
      workerStatus,
      scoreDistResult,
      completenessResult,
    ] = await Promise.all([
      // Lead stats by county
      supabase.rpc('bs_status_lead_stats').then(r => r).catch(() => null),

      // Recent operations (last 20)
      supabase
        .from('bs_operations')
        .select('operation_key, status, started_at, completed_at, leads_created, leads_updated, leads_enriched, leads_failed')
        .order('started_at', { ascending: false })
        .limit(20),

      // App config (firecrawl usage, email sent flags)
      supabase
        .from('bs_app_config')
        .select('key, value, updated_at'),

      // Enrichment logs (last 7 days)
      supabase
        .from('bs_enrichment_logs')
        .select('source, status, created_at')
        .gte('created_at', new Date(now.getTime() - 7 * 86400000).toISOString())
        .order('created_at', { ascending: false }),

      // Total signal count
      supabase
        .from('bs_signals')
        .select('id', { count: 'exact', head: true }),

      // Worker health
      workerHealth(),

      // Score distribution (run raw count queries)
      Promise.all([
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).gte('distress_score', 80),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).gte('distress_score', 50).lt('distress_score', 80),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).gte('distress_score', 25).lt('distress_score', 50),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).lt('distress_score', 25),
      ]),

      // Data completeness
      Promise.all([
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).not('owner_name', 'is', null).neq('owner_name', ''),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).not('owner_phone', 'is', null).neq('owner_phone', ''),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).not('beds', 'is', null),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).not('latitude', 'is', null),
        supabase.from('bs_leads').select('id', { count: 'exact', head: true }).not('assessed_value', 'is', null),
      ]),
    ])

    // Parse operations into pipeline status
    const operations = (operationsResult.data || []) as OperationRow[]
    const lastScrape = operations.find(o => o.operation_key === 'worker_scrape')
    const lastEnrichment = operations.find(o =>
      o.operation_key === 'worker_enrichment' || o.operation_key === 'enrich_vacancy_only'
    )
    const lastEmail = operations.find(o => o.operation_key === 'worker_daily_excel')
    const lastScoreRecompute = operations.find(o => o.operation_key === 'recompute_scores')

    // Parse config for Firecrawl credits and email sent status
    const config = (configResult.data || []) as ConfigRow[]
    const todayFirecrawl = config.find(c => c.key === `firecrawl_used_${now.toISOString().slice(0, 10)}`)
    const yesterdayDate = new Date(now.getTime() - 86400000).toISOString().slice(0, 10)
    const yesterdayFirecrawl = config.find(c => c.key === `firecrawl_used_${yesterdayDate}`)
    const emailSentToday = config.find(c => c.key === `email_sent_${todayKey}`)

    // Calculate 30-day Firecrawl usage
    const firecrawlKeys = config.filter(c => c.key.startsWith('firecrawl_used_'))
    const firecrawlTotal30d = firecrawlKeys.reduce((sum, c) => {
      const dateStr = c.key.replace('firecrawl_used_', '')
      const d = new Date(dateStr)
      if (now.getTime() - d.getTime() < 30 * 86400000) {
        return sum + parseInt(c.value || '0', 10)
      }
      return sum
    }, 0)

    // Parse enrichment logs into daily stats
    const enrichmentLogs = (enrichmentLogsResult.data || []) as Array<{ source: string; status: string; created_at: string }>
    const enrichmentBySource: Record<string, { success: number; failed: number; total: number }> = {}
    for (const log of enrichmentLogs) {
      const src = log.source || 'unknown'
      if (!enrichmentBySource[src]) enrichmentBySource[src] = { success: 0, failed: 0, total: 0 }
      enrichmentBySource[src].total++
      if (log.status === 'success') enrichmentBySource[src].success++
      else enrichmentBySource[src].failed++
    }

    // Count recent failures
    const recentOps = operations.slice(0, 10)
    const failedOps = recentOps.filter(o => o.status === 'failed' || o.status === 'timed_out' || o.status === 'error')
    const consecutiveFailures = (() => {
      let count = 0
      for (const op of recentOps) {
        if (op.status === 'failed' || op.status === 'timed_out' || op.status === 'error') count++
        else break
      }
      return count
    })()

    // Score distribution
    const [hotResult, warmResult, modResult, lowResult] = scoreDistResult
    const scoreDistribution = {
      critical: hotResult.count || 0,
      high: warmResult.count || 0,
      medium: modResult.count || 0,
      low: lowResult.count || 0,
    }

    // Data completeness
    const [totalResult, ownerResult, phoneResult, bedsResult, geoResult, assessedResult] = completenessResult
    const total = totalResult.count || 0
    const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0
    const dataCompleteness = {
      total,
      owner_name: { count: ownerResult.count || 0, pct: pct(ownerResult.count || 0) },
      phone: { count: phoneResult.count || 0, pct: pct(phoneResult.count || 0) },
      beds_baths: { count: bedsResult.count || 0, pct: pct(bedsResult.count || 0) },
      geocoded: { count: geoResult.count || 0, pct: pct(geoResult.count || 0) },
      assessed_value: { count: assessedResult.count || 0, pct: pct(assessedResult.count || 0) },
    }

    // Determine overall health
    const alerts: Array<{ level: 'critical' | 'warning' | 'info'; message: string }> = []

    if (!workerStatus.ok) {
      alerts.push({ level: 'critical', message: `Scraper worker unreachable: ${workerStatus.error || 'unknown'}` })
    }
    if (consecutiveFailures >= 3) {
      alerts.push({ level: 'critical', message: `${consecutiveFailures} consecutive operation failures` })
    }
    if (firecrawlTotal30d > 2700) {
      alerts.push({ level: 'warning', message: `Firecrawl credits at ${firecrawlTotal30d}/3000 (${Math.round(firecrawlTotal30d / 30)}% used)` })
    }
    if (firecrawlTotal30d >= 3000) {
      alerts.push({ level: 'critical', message: 'Firecrawl monthly credits exhausted' })
    }
    if (!emailSentToday && now.getUTCHours() >= 8) {
      alerts.push({ level: 'warning', message: 'Daily email has not been sent today' })
    }
    if (failedOps.length > 5) {
      alerts.push({ level: 'warning', message: `${failedOps.length}/10 recent operations failed` })
    }
    if (dataCompleteness.phone.pct < 5) {
      alerts.push({ level: 'info', message: `Only ${dataCompleteness.phone.pct}% of leads have phone numbers — run skip-trace enrichment` })
    }

    const overallHealth = alerts.some(a => a.level === 'critical')
      ? 'critical'
      : alerts.some(a => a.level === 'warning')
        ? 'degraded'
        : 'healthy'

    return NextResponse.json({
      status: overallHealth,
      checked_at: now.toISOString(),
      alerts,

      pipeline: {
        last_scrape: lastScrape ? {
          status: lastScrape.status,
          started_at: lastScrape.started_at,
          completed_at: lastScrape.completed_at,
          leads_created: lastScrape.leads_created,
          leads_updated: lastScrape.leads_updated,
        } : null,
        last_enrichment: lastEnrichment ? {
          status: lastEnrichment.status,
          started_at: lastEnrichment.started_at,
          completed_at: lastEnrichment.completed_at,
          leads_enriched: lastEnrichment.leads_enriched,
        } : null,
        last_email: lastEmail ? {
          status: lastEmail.status,
          started_at: lastEmail.started_at,
        } : null,
        last_score_recompute: lastScoreRecompute ? {
          status: lastScoreRecompute.status,
          started_at: lastScoreRecompute.started_at,
        } : null,
        email_sent_today: !!emailSentToday,
      },

      worker: {
        ok: workerStatus.ok,
        status: workerStatus.status,
        error: workerStatus.error,
      },

      api_credits: {
        firecrawl: {
          used_today: parseInt(todayFirecrawl?.value || '0', 10),
          used_yesterday: parseInt(yesterdayFirecrawl?.value || '0', 10),
          used_30d: firecrawlTotal30d,
          monthly_limit: 3000,
          remaining: Math.max(0, 3000 - firecrawlTotal30d),
        },
      },

      data_quality: {
        total_leads: total,
        score_distribution: scoreDistribution,
        completeness: dataCompleteness,
        total_signals: signalCountResult.count || 0,
      },

      enrichment_7d: enrichmentBySource,

      recent_operations: operations.slice(0, 10).map(o => ({
        operation: o.operation_key,
        status: o.status,
        started_at: o.started_at,
        completed_at: o.completed_at,
        leads_created: o.leads_created,
        leads_updated: o.leads_updated,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
