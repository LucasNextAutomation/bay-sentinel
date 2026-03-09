/** Operation progress tracking — updates bs_operations table in real-time */
import { supabase } from '@/lib/db'
import type { ScraperStep } from './types'

export class OperationProgress {
  private opId: number
  private steps: ScraperStep[]

  constructor(opId: number, steps: ScraperStep[]) {
    this.opId = opId
    this.steps = steps.map((s) => ({ ...s }))
  }

  /** Mark a step as running */
  async startStep(index: number): Promise<void> {
    if (index < this.steps.length) {
      this.steps = this.steps.map((s, i) => ({
        ...s,
        status: i < index ? 'success' : i === index ? 'running' : 'pending',
      }))
      await this.flush()
    }
  }

  /** Mark a step as complete with record count */
  async completeStep(index: number, records: number): Promise<void> {
    if (index < this.steps.length) {
      this.steps = this.steps.map((s, i) => ({
        ...s,
        status: i <= index ? 'success' : s.status,
        records: i === index ? records : s.records,
      }))
      await this.flush()
    }
  }

  /** Mark a step as failed */
  async failStep(index: number, detail?: string): Promise<void> {
    if (index < this.steps.length) {
      this.steps = this.steps.map((s, i) => ({
        ...s,
        status: i === index ? 'failed' : s.status,
        detail: i === index && detail ? detail : s.detail,
      }))
      await this.flush()
    }
  }

  /** Get final steps array */
  getSteps(): ScraperStep[] {
    return this.steps.map((s) => ({ ...s }))
  }

  /** Flush current steps to database */
  private async flush(): Promise<void> {
    await supabase
      .from('bs_operations')
      .update({ steps: this.steps })
      .eq('id', this.opId)
  }
}

/** Mark operation as completed */
export async function completeOperation(
  opId: number,
  operationKey: string,
  label: string,
  startedAt: string,
  result: {
    leads_created: number
    leads_updated: number
    leads_enriched: number
    leads_failed: number
    steps: ScraperStep[]
  }
): Promise<void> {
  const completedAt = new Date().toISOString()
  const durationSeconds = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
  )

  await supabase
    .from('bs_operations')
    .update({
      status: 'completed',
      is_active: false,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      leads_created: result.leads_created,
      leads_updated: result.leads_updated,
      leads_enriched: result.leads_enriched,
      leads_failed: result.leads_failed,
      steps: result.steps,
    })
    .eq('id', opId)

  await supabase.from('bs_notification_events').insert({
    event_type: 'operation_completed',
    data: {
      operation_id: opId,
      operation_key: operationKey,
      label,
      status: 'completed',
      duration_seconds: durationSeconds,
      leads_created: result.leads_created,
      leads_updated: result.leads_updated,
      leads_enriched: result.leads_enriched,
    },
  })
}

/** Mark operation as failed */
export async function failOperation(
  opId: number,
  startedAt: string,
  errorMessage: string,
  steps: ScraperStep[]
): Promise<void> {
  const completedAt = new Date().toISOString()
  const durationSeconds = Math.round(
    (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000
  )

  await supabase
    .from('bs_operations')
    .update({
      status: 'failed',
      is_active: false,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      leads_failed: 0,
      steps: [
        ...steps,
        { name: 'Error', detail: errorMessage, status: 'failed' as const, records: 0 },
      ],
    })
    .eq('id', opId)
}
