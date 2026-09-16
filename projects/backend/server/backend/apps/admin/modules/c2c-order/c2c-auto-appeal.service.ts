import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderAutoAppealStatus,
  MerchantOrderEntity,
  MerchantOrderSide,
  MerchantOrderStatus,
  MerchantPlatform,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, LessThanOrEqual, Repository } from 'typeorm'
import { C2cOrderAppealService } from './c2c-order-appeal.service'
import {
  C2cAppealProcessingError,
  C2cAppealReasonRequiredError,
  C2cAppealSubmissionUncertainError,
  C2cAppealUpstreamStatusError,
} from './c2c-order-appeal.service'
import { C2cBuyOrderStatus } from '../c2c-platform'
const RETRY_DELAY_MIN_MS = 60_000
const RETRY_DELAY_MAX_MS = 60 * 60_000
const TERMINAL_ORDER_STATUSES = new Set<C2cBuyOrderStatus>([
  C2cBuyOrderStatus.DISPUTED,
  C2cBuyOrderStatus.COMPLETED,
  C2cBuyOrderStatus.CANCELLED,
  C2cBuyOrderStatus.EXPIRED,
])

@Injectable()
export class C2cAutoAppealService {
  private readonly logger = new Logger(C2cAutoAppealService.name)

  constructor(
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    @InjectRepository(MerchantOrderEntity)
    private readonly orders: Repository<MerchantOrderEntity>,
    private readonly appeals: C2cOrderAppealService,
  ) {}

  async scanAll(now = new Date()) {
    const merchants = await this.merchants.find({
      where: {
        platform: MerchantPlatform.BINANCE,
        status: BusinessStatus.ACTIVE,
        autoAppealEnabled: true,
      },
    })
    const results: Array<Record<string, unknown>> = []
    for (const merchant of merchants) {
      try {
        const result = await this.scanMerchant(merchant, now)
        await this.merchants.update(
          { id: merchant.id, tenantId: merchant.tenantId },
          { autoAppealLastScanAt: now, autoAppealLastError: null },
        )
        results.push(result)
      } catch (error) {
        const message = this.errorMessage(error)
        await this.recordScanFailure(merchant, message)
        this.logger.error(`C2C 自动申诉扫描失败: merchant=${merchant.id}, error=${message}`)
        results.push({ merchantId: merchant.id, error: message })
      }
    }
    return results
  }

  private async scanMerchant(merchant: MerchantEntity, now: Date) {
    if (!merchant.autoAppealEnabledAt) {
      return { merchantId: merchant.id, skipped: true, reason: 'MISSING_ENABLED_AT' }
    }
    const paidBefore = new Date(now.getTime() - merchant.autoAppealDelayMinutes * 60_000)
    const candidates = await this.orders
      .createQueryBuilder('merchant_order')
      .innerJoin(
        PaymentOrderEntity,
        'payment_order',
        'payment_order."tenantId" = merchant_order."tenantId" AND ' +
          'payment_order."merchantId" = merchant_order."merchantId" AND ' +
          'payment_order."sourceType" = :sourceType AND ' +
          'payment_order."sourceBusinessNo" = merchant_order."platformOrderId"',
        { sourceType: PaymentSourceType.C2C_BUY },
      )
      .addSelect('payment_order.platformConfirmedAt')
      .where('merchant_order."tenantId" = :tenantId', { tenantId: merchant.tenantId })
      .andWhere('merchant_order."merchantId" = :merchantId', { merchantId: merchant.id })
      .andWhere('merchant_order.side = :side', { side: MerchantOrderSide.BUY })
      .andWhere('merchant_order.status = :status', { status: MerchantOrderStatus.PENDING_RELEASE })
      .andWhere('merchant_order."appealStatus" IS NULL')
      .andWhere('payment_order."platformConfirmedAt" >= :enabledAt', {
        enabledAt: merchant.autoAppealEnabledAt,
      })
      .andWhere(
        '(merchant_order."autoAppealStatus" IS NULL OR merchant_order."autoAppealStatus" = :retry)',
        { retry: MerchantOrderAutoAppealStatus.RETRY },
      )
      .andWhere(
        '(merchant_order."autoAppealNextAttemptAt" IS NULL OR merchant_order."autoAppealNextAttemptAt" <= :now)',
        { now },
      )
      .andWhere('payment_order.status = :paymentStatus', {
        paymentStatus: PaymentOrderStatus.SUCCESS,
      })
      .andWhere('payment_order."platformConfirmStatus" = :platformConfirmStatus', {
        platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
      })
      .andWhere('payment_order."platformConfirmedAt" <= :paidBefore', { paidBefore })
      .orderBy('payment_order.platformConfirmedAt', 'ASC')
      .take(20)
      .getMany()

    let submitted = 0
    let retry = 0
    let skipped = 0
    let manualRequired = 0
    let processing = 0
    for (const order of candidates) {
      try {
        await this.appeals.submitForAuto(merchant.tenantId, merchant.id, order.id)
        await this.markFinal(order, MerchantOrderAutoAppealStatus.SUBMITTED, null, now)
        submitted += 1
      } catch (error) {
        if (error instanceof C2cAppealProcessingError) {
          processing += 1
          continue
        }
        if (error instanceof C2cAppealSubmissionUncertainError) {
          processing += 1
          this.logger.error(
            `C2C 自动申诉结果待核对: merchant=${merchant.id}, order=${order.platformOrderId}, error=${this.errorMessage(error.originalError)}`,
          )
          continue
        }
        if (error instanceof C2cAppealReasonRequiredError) {
          const available = error.reasons
            .map((item) => `${item.reasonCode}:${item.reasonDesc}`)
            .join('；')
          await this.markFinal(
            order,
            MerchantOrderAutoAppealStatus.MANUAL_REQUIRED,
            `上游未提供原因码1，可用原因：${available}`,
            now,
          )
          manualRequired += 1
          continue
        }
        if (
          error instanceof C2cAppealUpstreamStatusError &&
          TERMINAL_ORDER_STATUSES.has(error.orderStatus)
        ) {
          const message = `上游订单已结束，状态：${error.orderStatus}`
          await this.markFinal(order, MerchantOrderAutoAppealStatus.SKIPPED, message, now)
          skipped += 1
          continue
        }
        const message = this.errorMessage(error)
        const attempts = order.autoAppealAttempts + 1
        const delay = Math.min(
          RETRY_DELAY_MIN_MS * 2 ** Math.max(attempts - 1, 0),
          RETRY_DELAY_MAX_MS,
        )
        await this.orders.update(
          {
            id: order.id,
            tenantId: merchant.tenantId,
            merchantId: merchant.id,
            appealStatus: IsNull(),
            autoAppealNextAttemptAt: order.autoAppealNextAttemptAt
              ? LessThanOrEqual(now)
              : IsNull(),
          },
          {
            autoAppealStatus: MerchantOrderAutoAppealStatus.RETRY,
            autoAppealAttempts: attempts,
            autoAppealNextAttemptAt: new Date(now.getTime() + delay),
            autoAppealLastError: message,
          },
        )
        retry += 1
        this.logger.warn(
          `C2C 自动申诉稍后重试: merchant=${merchant.id}, order=${order.platformOrderId}, attempts=${attempts}, error=${message}`,
        )
      }
    }
    return {
      merchantId: merchant.id,
      candidates: candidates.length,
      submitted,
      retry,
      skipped,
      manualRequired,
      processing,
    }
  }

  private async markFinal(
    order: MerchantOrderEntity,
    status: MerchantOrderAutoAppealStatus,
    error: string | null,
    now: Date,
  ) {
    await this.orders.update(
      { id: order.id, tenantId: order.tenantId, merchantId: order.merchantId },
      {
        autoAppealStatus: status,
        autoAppealProcessedAt: now,
        autoAppealNextAttemptAt: null,
        autoAppealLastError: error,
        ...(status === MerchantOrderAutoAppealStatus.SUBMITTED
          ? {}
          : { appealReasonCode: null, appealReason: null, appealClaimedAt: null }),
      },
    )
  }

  private async recordScanFailure(merchant: MerchantEntity, error: string): Promise<void> {
    try {
      await this.merchants.update(
        { id: merchant.id, tenantId: merchant.tenantId },
        { autoAppealLastError: error },
      )
    } catch (persistenceError) {
      this.logger.error(
        `C2C 自动申诉扫描错误保存失败: merchant=${merchant.id}, error=${this.errorMessage(persistenceError)}`,
      )
    }
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
