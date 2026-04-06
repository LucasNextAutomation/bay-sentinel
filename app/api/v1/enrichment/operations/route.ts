import { NextRequest, NextResponse } from 'next/server'
import { requireWorkerActions } from '@/lib/auth'
import { isWorkerConfigured } from '@/lib/worker'
import {
  ENRICHMENT_OPERATIONS,
  EnrichmentOperationKey,
} from '@/lib/enrichment-operations'

export async function GET(request: NextRequest) {
  try {
    await requireWorkerActions(request)
    if (!isWorkerConfigured()) {
      return NextResponse.json({})
    }
    // Narrow the record type for JSON serialization
    const operations: Record<EnrichmentOperationKey, (typeof ENRICHMENT_OPERATIONS)[EnrichmentOperationKey]> =
      ENRICHMENT_OPERATIONS
    return NextResponse.json(operations)
  } catch (thrown) {
    if (thrown instanceof Response) return thrown
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
