import type { MerchantPlatform } from '@admin/database'
import type { C2cBuyOrderDetail } from '../c2c-platform'

export interface C2cOrderSyncStore {
  claimDue: (
    owner: string,
    now: Date,
    limit: number,
    leaseMs: number,
  ) => Promise<Array<{ tenantId: string; merchantId: string }>>
  getLastSuccessAt: (tenantId: string, merchantId: string) => Promise<Date | null>
  persistWindow: (
    scope: { tenantId: string; merchantId: string; platform: MerchantPlatform },
    orders: C2cBuyOrderDetail[],
    completedAt: Date,
  ) => Promise<{
    created: number
    updated: number
    createdOrderIds?: string[]
    changedOrderIds?: string[]
  }>
  recordFailure: (
    tenantId: string,
    merchantId: string,
    attemptedAt: Date,
    error: string,
  ) => Promise<void>
}
