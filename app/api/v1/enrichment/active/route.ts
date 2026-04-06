import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/db'
import { requireWorkerActions } from '@/lib/auth'
import { workerHealth } from '@/lib/worker'

const TIMEOUT_THRESHOLD_SECONDS = 3600 // 60 minutes — scrapes can take 20-40 min per county

export async function GET(request: NextRequest) {
  try {
    await requireWorkerActions(request)

    const { data: activeOps, error } = await supabase
      .from('bs_operations')
      .select('*')
      .eq('is_active', true)
      .order('started_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch active operations', detail: error.message },
        { status: 500 }
      )
    }

    const now = Date.now()
    const result: Array<Record<string, unknown>> = []

    // Only check worker health once if we have old operations
    let workerStatus: { ok: boolean; error?: string } | null = null

    for (const op of activeOps || []) {
      const startedMs = new Date(op.started_at).getTime()
      const elapsedSeconds = Math.round((now - startedMs) / 1000)

      if (op.status === 'running' && elapsedSeconds > TIMEOUT_THRESHOLD_SECONDS) {
        // Check worker health (lazy, once per request)
        if (workerStatus === null) {
          workerStatus = await workerHealth()
        }

        if (!workerStatus.ok) {
          // Worker is down — mark operation as error
          await supabase
            .from('bs_operations')
            .update({
              status: 'error',
              is_active: false,
              completed_at: new Date().toISOString(),
              duration_seconds: elapsedSeconds,
            })
            .eq('id', op.id)

          await supabase.from('bs_notification_events').insert({
            event_type: 'operation_completed',
            data: {
              operation_id: op.id,
              operation_key: op.operation_key,
              label: op.label,
              status: 'error',
              duration_seconds: elapsedSeconds,
              error: `Worker unreachable: ${workerStatus.error || 'unknown'}`,
            },
          })

          continue
        }

        // Worker is healthy but operation exceeded timeout — mark as timed_out
        await supabase
          .from('bs_operations')
          .update({
            status: 'timed_out',
            is_active: false,
            completed_at: new Date().toISOString(),
            duration_seconds: elapsedSeconds,
          })
          .eq('id', op.id)

        await supabase.from('bs_notification_events').insert({
          event_type: 'operation_completed',
          data: {
            operation_id: op.id,
            operation_key: op.operation_key,
            label: op.label,
            status: 'timed_out',
            duration_seconds: elapsedSeconds,
          },
        })

        continue
      }

      // Still running within timeout — return with elapsed time
      result.push({
        ...op,
        elapsed_seconds: elapsedSeconds,
      })
    }

    return NextResponse.json(result)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
