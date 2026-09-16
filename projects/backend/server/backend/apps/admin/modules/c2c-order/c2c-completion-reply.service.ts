import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderCompletionReplyStatus,
  MerchantOrderEntity,
  MerchantOrderSide,
  MerchantOrderStatus,
  MerchantPlatform,
} from '@admin/database'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import {
  C2cBuyOrderStatus,
  C2cPlatformClient,
  C2cPlatformCredentialFactory,
  type C2cPlatformCredentials,
} from '../c2c-platform'
import { C2C_SECRET_RESOLVER, type C2cSecretResolver } from './c2c-secret-resolver'
import { C2cPlatformChatService } from './c2c-platform-chat.service'
import { C2C_ORDER_SYNC_STORE } from './c2c-order.tokens'
import type { C2cOrderSyncStore } from './c2c-order-sync.types'

const CLAIM_LEASE_MS = 5 * 60_000
const RETRY_DELAY_MIN_MS = 60_000
const RETRY_DELAY_MAX_MS = 60 * 60_000

@Injectable()
export class C2cCompletionReplyService {
  private readonly logger = new Logger(C2cCompletionReplyService.name)

  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    @InjectRepository(MerchantOrderEntity)
    private readonly orders: Repository<MerchantOrderEntity>,
    @Inject(C2C_ORDER_SYNC_STORE) private readonly syncStore: C2cOrderSyncStore,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(C2C_SECRET_RESOLVER) private readonly secretResolver: C2cSecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platformClient: C2cPlatformClient,
    private readonly platformChat: C2cPlatformChatService,
  ) {}

  async scanAll(now = new Date()) {
    const merchants = await this.merchants.find({
      where: {
        platform: MerchantPlatform.BINANCE,
        status: BusinessStatus.ACTIVE,
        c2cChatOrderCompletedEnabled: true,
      },
    })
    const results: Array<Record<string, unknown>> = []
    for (const merchant of merchants) {
      try {
        const result = await this.scanMerchant(merchant, now)
        await this.merchants.update(
          { id: merchant.id, tenantId: merchant.tenantId },
          {
            c2cChatOrderCompletedLastScanAt: now,
            c2cChatOrderCompletedLastError: null,
          },
        )
        results.push(result)
      } catch (error) {
        const message = this.errorMessage(error)
        await this.recordScanFailure(merchant, message)
        this.logger.error(`C2C 完成自动回复扫描失败: merchant=${merchant.id}, error=${message}`)
        results.push({ merchantId: merchant.id, error: message })
      }
    }
    return results
  }

  async sendCompletedOrders(
    tenantId: string,
    merchantId: string,
    merchantOrderIds: string[],
    now = new Date(),
  ): Promise<void> {
    if (!merchantOrderIds.length) return
    const merchant = await this.merchants.findOne({ where: { id: merchantId, tenantId } })
    if (!merchant || !this.isEligibleMerchant(merchant)) return
    const orders = await this.orders
      .createQueryBuilder('merchant_order')
      .where('merchant_order."tenantId" = :tenantId', { tenantId })
      .andWhere('merchant_order."merchantId" = :merchantId', { merchantId })
      .andWhere('merchant_order.id IN (:...ids)', { ids: merchantOrderIds })
      .andWhere('merchant_order.status = :status', { status: MerchantOrderStatus.COMPLETED })
      .andWhere('merchant_order."platformCreatedAt" >= :enabledAt', {
        enabledAt: merchant.c2cChatOrderCompletedEnabledAt!,
      })
      .getMany()
    await Promise.all(orders.map((order) => this.sendClaimed(order, now)))
  }

  private async scanMerchant(merchant: MerchantEntity, now: Date) {
    if (!this.isEligibleMerchant(merchant)) {
      return { merchantId: merchant.id, skipped: true, reason: 'MISSING_ENABLED_AT' }
    }
    const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS)
    const candidates = await this.findPendingCandidates(merchant)

    let credentials: C2cPlatformCredentials | undefined
    let checked = 0
    let checkFailed = 0
    let sent = 0
    let failed = 0
    let skipped = 0
    for (const order of candidates) {
      try {
        if (order.status === MerchantOrderStatus.PENDING_RELEASE) {
          credentials ??= await this.resolveCredentials(merchant)
          const detail = await this.platformClient.getOrderDetail(
            merchant.platform,
            credentials,
            order.platformOrderId,
          )
          if (detail.platformOrderId !== order.platformOrderId) {
            throw new Error('上游订单详情返回的订单号不一致')
          }
          await this.syncStore.updateObservedStatus({
            tenantId: order.tenantId,
            merchantId: order.merchantId,
            merchantOrderId: order.id,
            platformStatus: detail.status,
            observedAt: now,
          })
          checked += 1
          if (detail.status === C2cBuyOrderStatus.COMPLETED) {
            order.status = MerchantOrderStatus.COMPLETED
            order.platformStatus = detail.status
          } else if (
            [C2cBuyOrderStatus.CANCELLED, C2cBuyOrderStatus.EXPIRED].includes(detail.status)
          ) {
            await this.markSkipped(order, `上游订单状态 ${detail.status} 已终止，无需发送完成回复`)
            skipped += 1
            continue
          } else {
            continue
          }
        }
        const delivered = await this.sendClaimed(order, now)
        if (delivered === true) sent += 1
        if (delivered === false) failed += 1
      } catch (error) {
        checkFailed += 1
        this.logger.error(
          `C2C 完成状态查询失败: merchant=${merchant.id}, order=${order.platformOrderId}, error=${this.errorMessage(error)}`,
        )
      }
    }

    const retryable = await this.findRetryableCandidates(merchant, now, staleBefore)
    for (const order of retryable) {
      const delivered = await this.sendClaimed(order, now)
      if (delivered === true) sent += 1
      if (delivered === false) failed += 1
    }
    return {
      merchantId: merchant.id,
      candidates: candidates.length,
      checked,
      checkFailed,
      retryable: retryable.length,
      sent,
      failed,
      skipped,
    }
  }

  private findPendingCandidates(merchant: MerchantEntity): Promise<MerchantOrderEntity[]> {
    return this.orders
      .createQueryBuilder('merchant_order')
      .where('merchant_order."tenantId" = :tenantId', { tenantId: merchant.tenantId })
      .andWhere('merchant_order."merchantId" = :merchantId', { merchantId: merchant.id })
      .andWhere('merchant_order.side = :side', { side: MerchantOrderSide.BUY })
      .andWhere('merchant_order."platformCreatedAt" >= :enabledAt', {
        enabledAt: merchant.c2cChatOrderCompletedEnabledAt!,
      })
      .andWhere('merchant_order.status IN (:...statuses)', {
        statuses: [MerchantOrderStatus.PENDING_RELEASE, MerchantOrderStatus.COMPLETED],
      })
      .andWhere(
        new Brackets((query) => {
          query
            .where('merchant_order."completionReplyStatus" IS NULL')
            .orWhere('merchant_order."completionReplyStatus" = :pending', {
              pending: MerchantOrderCompletionReplyStatus.PENDING,
            })
        }),
      )
      .orderBy('merchant_order."platformCreatedAt"', 'ASC')
      .getMany()
  }

  private findRetryableCandidates(
    merchant: MerchantEntity,
    now: Date,
    staleBefore: Date,
  ): Promise<MerchantOrderEntity[]> {
    return this.orders
      .createQueryBuilder('merchant_order')
      .where('merchant_order."tenantId" = :tenantId', { tenantId: merchant.tenantId })
      .andWhere('merchant_order."merchantId" = :merchantId', { merchantId: merchant.id })
      .andWhere('merchant_order.side = :side', { side: MerchantOrderSide.BUY })
      .andWhere('merchant_order."platformCreatedAt" >= :enabledAt', {
        enabledAt: merchant.c2cChatOrderCompletedEnabledAt!,
      })
      .andWhere('merchant_order.status = :completed', {
        completed: MerchantOrderStatus.COMPLETED,
      })
      .andWhere(
        new Brackets((query) => {
          query
            .where(
              '(merchant_order."completionReplyStatus" = :failed AND ' +
                '(merchant_order."completionReplyNextRetryAt" IS NULL OR ' +
                'merchant_order."completionReplyNextRetryAt" <= :now))',
              { failed: MerchantOrderCompletionReplyStatus.FAILED, now },
            )
            .orWhere(
              '(merchant_order."completionReplyStatus" = :sending AND ' +
                'merchant_order."completionReplyClaimedAt" <= :staleBefore)',
              { sending: MerchantOrderCompletionReplyStatus.SENDING, staleBefore },
            )
        }),
      )
      .orderBy('merchant_order."completionReplyNextRetryAt"', 'ASC', 'NULLS FIRST')
      .getMany()
  }

  private isEligibleMerchant(merchant: MerchantEntity | null): boolean {
    return Boolean(
      merchant &&
        merchant.platform === MerchantPlatform.BINANCE &&
        merchant.status === BusinessStatus.ACTIVE &&
        merchant.c2cChatOrderCompletedEnabled &&
        merchant.c2cChatOrderCompletedEnabledAt,
    )
  }

  private async sendClaimed(order: MerchantOrderEntity, now: Date): Promise<boolean | null> {
    const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS)
    const claimed = await this.orders
      .createQueryBuilder()
      .update(MerchantOrderEntity)
      .set({
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SENDING,
        completionReplyClaimedAt: now,
        completionReplyAttempts: () => '"completionReplyAttempts" + 1',
      })
      .where('id = :id AND "tenantId" = :tenantId AND "merchantId" = :merchantId', order)
      .andWhere('status = :status', { status: MerchantOrderStatus.COMPLETED })
      .andWhere(
        `(
          "completionReplyStatus" IS NULL OR
          "completionReplyStatus" = :pending OR
          ("completionReplyStatus" = :failed AND
            ("completionReplyNextRetryAt" IS NULL OR "completionReplyNextRetryAt" <= :now)) OR
          ("completionReplyStatus" = :sending AND "completionReplyClaimedAt" <= :staleBefore)
        )`,
        {
          pending: MerchantOrderCompletionReplyStatus.PENDING,
          failed: MerchantOrderCompletionReplyStatus.FAILED,
          sending: MerchantOrderCompletionReplyStatus.SENDING,
          now,
          staleBefore,
        },
      )
      .execute()
    if (claimed.affected !== 1) return null
    try {
      await this.platformChat.sendOrderCompletedStrict(order.tenantId, order.merchantId, order.id)
      await this.orders.update(
        {
          id: order.id,
          tenantId: order.tenantId,
          merchantId: order.merchantId,
          completionReplyStatus: MerchantOrderCompletionReplyStatus.SENDING,
        },
        {
          completionReplyStatus: MerchantOrderCompletionReplyStatus.SENT,
          completionReplySentAt: now,
          completionReplyNextRetryAt: null,
          completionReplyLastError: null,
        },
      )
      return true
    } catch (error) {
      const attempts = order.completionReplyAttempts + 1
      const delay = Math.min(
        RETRY_DELAY_MIN_MS * 2 ** Math.max(attempts - 1, 0),
        RETRY_DELAY_MAX_MS,
      )
      await this.orders.update(
        {
          id: order.id,
          tenantId: order.tenantId,
          merchantId: order.merchantId,
          completionReplyStatus: MerchantOrderCompletionReplyStatus.SENDING,
        },
        {
          completionReplyStatus: MerchantOrderCompletionReplyStatus.FAILED,
          completionReplyNextRetryAt: new Date(now.getTime() + delay),
          completionReplyLastError: this.errorMessage(error),
        },
      )
      this.logger.error(
        `C2C 完成自动回复发送失败: merchant=${order.merchantId}, order=${order.platformOrderId}, error=${this.errorMessage(error)}`,
      )
      return false
    }
  }

  private markSkipped(order: MerchantOrderEntity, reason: string): Promise<unknown> {
    return this.orders.update(
      { id: order.id, tenantId: order.tenantId, merchantId: order.merchantId },
      {
        completionReplyStatus: MerchantOrderCompletionReplyStatus.SKIPPED,
        completionReplyNextRetryAt: null,
        completionReplyLastError: reason,
      },
    )
  }

  private async resolveCredentials(merchant: MerchantEntity) {
    const reference = await this.credentialService.getActiveReference(
      merchant.tenantId,
      merchant.id,
    )
    const secret = await this.secretResolver.resolve(reference.credentialRef)
    return this.credentialFactory.create(merchant.platform, reference, secret)
  }

  private async recordScanFailure(merchant: MerchantEntity, error: string): Promise<void> {
    try {
      await this.merchants.update(
        { id: merchant.id, tenantId: merchant.tenantId },
        { c2cChatOrderCompletedLastError: error },
      )
    } catch (persistenceError) {
      this.logger.error(
        `C2C 完成自动回复扫描错误保存失败: merchant=${merchant.id}, error=${this.errorMessage(persistenceError)}`,
      )
    }
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
