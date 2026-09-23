import type { MerchantOrderStatus, MerchantPlatform } from '@admin/database'
import type { C2cBuyOrderStatus } from '../c2c-platform'
import type { C2cBuyOrderDetail } from '../c2c-platform'

export interface C2cOrderSyncStore {
  claimDue: (
    owner: string,
    now: Date,
    limit: number,
    leaseMs: number,
  ) => Promise<Array<{ tenantId: string; merchantId: string }>>
  getLastSuccessAt: (tenantId: string, merchantId: string) => Promise<Date | null>
  findPendingReviewOrderIds: (tenantId: string, merchantId: string) => Promise<string[]>
  updateObservedStatus: (input: {
    tenantId: string
    merchantId: string
    merchantOrderId: string
    platformStatus: C2cBuyOrderStatus
    observedAt: Date
  }) => Promise<MerchantOrderStatus | null>
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
