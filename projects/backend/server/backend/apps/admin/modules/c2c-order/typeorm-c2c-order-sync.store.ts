import {
  MerchantOrderEntity,
  MerchantOrderSide,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
  MerchantPlatform,
} from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import { DataSource, EntityManager } from 'typeorm'
import { C2cBuyOrderStatus, type C2cBuyOrderDetail } from '../c2c-platform'
import type { C2cOrderSyncStore } from './c2c-order-sync.types'

@Injectable()
export class TypeOrmC2cOrderSyncStore implements C2cOrderSyncStore {
  constructor(
    @Inject(DataSource)
    private readonly dataSource: Pick<DataSource, 'transaction' | 'getRepository'>,
  ) {}

  claimDue(
    owner: string,
    now: Date,
    limit: number,
    leaseMs: number,
  ): Promise<Array<{ tenantId: string; merchantId: string }>> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
          INSERT INTO merchant_order_sync_checkpoint (
            "tenantId", "merchantId", "nextSyncAt", "consecutiveFailures"
          )
          SELECT merchant."tenantId", merchant.id, $1, 0
          FROM merchant
          WHERE merchant.status = 'active'
          ON CONFLICT ("tenantId", "merchantId") DO NOTHING
        `,
        [now],
      )
      return manager.query(
        `
          WITH due AS (
            SELECT checkpoint.id
            FROM merchant_order_sync_checkpoint checkpoint
            INNER JOIN merchant
              ON merchant.id = checkpoint."merchantId"
             AND merchant."tenantId" = checkpoint."tenantId"
            WHERE merchant.status = 'active'
              AND checkpoint."nextSyncAt" <= $1
              AND (
                checkpoint."leaseExpiresAt" IS NULL
                OR checkpoint."leaseExpiresAt" <= $1
              )
            ORDER BY checkpoint."nextSyncAt" ASC, checkpoint.id ASC
            FOR UPDATE OF checkpoint SKIP LOCKED
            LIMIT $2
          )
          UPDATE merchant_order_sync_checkpoint checkpoint
          SET "leaseOwner" = $3,
              "leaseExpiresAt" = $4,
              "updatedAt" = $1
          FROM due
          WHERE checkpoint.id = due.id
          RETURNING checkpoint."tenantId", checkpoint."merchantId"
        `,
        [now, limit, owner, new Date(now.getTime() + leaseMs)],
      )
    })
  }

  async getLastSuccessAt(tenantId: string, merchantId: string): Promise<Date | null> {
    const checkpoint = await this.dataSource
      .getRepository(MerchantOrderSyncCheckpointEntity)
      .findOne({
        where: { tenantId, merchantId },
        select: { lastSuccessAt: true },
      })
    return checkpoint?.lastSuccessAt ?? null
  }

  persistWindow(
    scope: { tenantId: string; merchantId: string; platform: MerchantPlatform },
    orders: C2cBuyOrderDetail[],
    completedAt: Date,
  ): Promise<{ created: number; updated: number }> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockMerchant(manager, scope.tenantId, scope.merchantId)
      let created = 0
      let updated = 0
      for (const incoming of orders) {
        const wasCreated = await this.saveOrder(manager, scope, incoming, completedAt)
        created += Number(wasCreated)
        updated += Number(!wasCreated)
      }
      await this.completeCheckpoint(manager, scope.tenantId, scope.merchantId, completedAt)
      return { created, updated }
    })
  }

  recordFailure(
    tenantId: string,
    merchantId: string,
    attemptedAt: Date,
    error: string,
  ): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      await this.lockMerchant(manager, tenantId, merchantId)
      const repository = manager.getRepository(MerchantOrderSyncCheckpointEntity)
      const existing = await repository.findOne({ where: { tenantId, merchantId } })
      await repository.save(
        repository.create({
          ...existing,
          tenantId,
          merchantId,
          lastAttemptAt: attemptedAt,
          nextSyncAt: new Date(
            attemptedAt.getTime() + this.retryDelay(existing?.consecutiveFailures ?? 0),
          ),
          consecutiveFailures: (existing?.consecutiveFailures ?? 0) + 1,
          lastError: error,
          leaseOwner: null,
          leaseExpiresAt: null,
        }),
      )
    })
  }

  private async saveOrder(
    manager: EntityManager,
    scope: { tenantId: string; merchantId: string; platform: MerchantPlatform },
    incoming: C2cBuyOrderDetail,
    syncedAt: Date,
  ): Promise<boolean> {
    const repository = manager.getRepository(MerchantOrderEntity)
    const historyRepository = manager.getRepository(MerchantOrderStatusHistoryEntity)
    const existing = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        merchantId: scope.merchantId,
        platform: scope.platform,
        platformOrderId: incoming.platformOrderId,
      },
      lock: { mode: 'pessimistic_write' },
    })
    const assetAmount = incoming.assetAmount
    if (!assetAmount) throw new Error('平台订单缺少数字资产数量')
    const status = this.nextStatus(existing?.status, incoming.status)
    const order = await repository.save(
      repository.create({
        ...existing,
        tenantId: scope.tenantId,
        merchantId: scope.merchantId,
        platform: scope.platform,
        platformOrderId: incoming.platformOrderId,
        side: MerchantOrderSide.BUY,
        platformStatus: incoming.status,
        status,
        asset: incoming.asset,
        assetAmount,
        fiatCurrency: incoming.fiatCurrency,
        fiatAmount: incoming.fiatAmount,
        unitPrice: null,
        counterpartyName: incoming.identityName || null,
        paymentMethod: incoming.paymentMethod || null,
        platformPaymentMethodId: incoming.platformPaymentMethodId || null,
        payeeIdentity: incoming.payeeIdentity || null,
        payeeName: incoming.payeeName || null,
        identityName: incoming.identityName || null,
        identityMatched: this.sameName(incoming.payeeName, incoming.identityName),
        payable: incoming.payable,
        paymentDeadline: incoming.paymentDeadline ? new Date(incoming.paymentDeadline) : null,
        platformCreatedAt: new Date(incoming.createdAt),
        platformUpdatedAt: incoming.updatedAt ? new Date(incoming.updatedAt) : null,
        lastSyncedAt: syncedAt,
        lastError: incoming.status === C2cBuyOrderStatus.UNKNOWN ? '平台返回未知订单状态' : null,
      }),
    )
    if (!existing || existing.status !== status) {
      await historyRepository.save(
        historyRepository.create({
          tenantId: scope.tenantId,
          merchantId: scope.merchantId,
          merchantOrderId: order.id,
          fromStatus: existing?.status ?? null,
          toStatus: status,
          source: 'PLATFORM_SYNC',
          platformStatus: incoming.status,
          reason: null,
        }),
      )
    }
    return !existing
  }

  private async completeCheckpoint(
    manager: EntityManager,
    tenantId: string,
    merchantId: string,
    completedAt: Date,
  ): Promise<void> {
    const repository = manager.getRepository(MerchantOrderSyncCheckpointEntity)
    const existing = await repository.findOne({ where: { tenantId, merchantId } })
    await repository.save(
      repository.create({
        ...existing,
        tenantId,
        merchantId,
        windowEndAt: completedAt,
        lastAttemptAt: completedAt,
        lastSuccessAt: completedAt,
        nextSyncAt: new Date(completedAt.getTime() + 30_000),
        consecutiveFailures: 0,
        lastError: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      }),
    )
  }

  private nextStatus(
    current: MerchantOrderStatus | undefined,
    platform: C2cBuyOrderStatus,
  ): MerchantOrderStatus {
    const terminal = [
      MerchantOrderStatus.COMPLETED,
      MerchantOrderStatus.CANCELLED,
      MerchantOrderStatus.EXPIRED,
      MerchantOrderStatus.FUNDS_EXCEPTION,
    ]
    if (current && terminal.includes(current)) return current
    const fundsExposed = current
      ? [
          MerchantOrderStatus.PAYMENT_PROCESSING,
          MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
          MerchantOrderStatus.PENDING_RELEASE,
        ].includes(current)
      : false
    if (
      fundsExposed &&
      [C2cBuyOrderStatus.CANCELLED, C2cBuyOrderStatus.EXPIRED, C2cBuyOrderStatus.DISPUTED].includes(
        platform,
      )
    ) {
      return MerchantOrderStatus.FUNDS_EXCEPTION
    }
    const mapped: Record<C2cBuyOrderStatus, MerchantOrderStatus> = {
      [C2cBuyOrderStatus.PENDING_PAYMENT]: MerchantOrderStatus.PENDING_PAYMENT,
      [C2cBuyOrderStatus.PAID]: MerchantOrderStatus.PENDING_RELEASE,
      [C2cBuyOrderStatus.DISPUTED]: MerchantOrderStatus.DISPUTED,
      [C2cBuyOrderStatus.COMPLETED]: MerchantOrderStatus.COMPLETED,
      [C2cBuyOrderStatus.CANCELLED]: MerchantOrderStatus.CANCELLED,
      [C2cBuyOrderStatus.EXPIRED]: MerchantOrderStatus.EXPIRED,
      [C2cBuyOrderStatus.UNKNOWN]: MerchantOrderStatus.EXCEPTION,
    }
    const next = mapped[platform]
    const progress = [
      MerchantOrderStatus.PENDING_PAYMENT,
      MerchantOrderStatus.PAYMENT_PROCESSING,
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      MerchantOrderStatus.PENDING_RELEASE,
      MerchantOrderStatus.COMPLETED,
    ]
    if (current && progress.includes(current) && progress.includes(next)) {
      return progress.indexOf(next) < progress.indexOf(current) ? current : next
    }
    return next
  }

  private sameName(left: string, right: string): boolean {
    const normalize = (value: string) => value.trim().replace(/\s+/g, '').toLocaleLowerCase()
    return Boolean(left && right && normalize(left) === normalize(right))
  }

  private retryDelay(previousFailures: number): number {
    return Math.min(30_000 * 2 ** previousFailures, 15 * 60_000)
  }

  private lockMerchant(
    manager: EntityManager,
    tenantId: string,
    merchantId: string,
  ): Promise<unknown> {
    return manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${tenantId}:${merchantId}`,
    ])
  }
}
