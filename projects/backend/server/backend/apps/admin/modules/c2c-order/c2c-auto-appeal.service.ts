import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderAutoAppealStatus,
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantPlatform,
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
    for (const merchant of merchants) results.push(await this.scanMerchant(merchant, now))
    return results
  }

  private async scanMerchant(merchant: MerchantEntity, now: Date) {
    if (!merchant.autoAppealEnabledAt) {
      return { merchantId: merchant.id, skipped: true, reason: 'MISSING_ENABLED_AT' }
    }
    const paidBefore = new Date(now.getTime() - merchant.autoAppealDelayMinutes * 60_000)
    const candidates = await this.orders
      .createQueryBuilder('merchantOrder')
      .innerJoin(
        'payment_order',
        'paymentOrder',
        'paymentOrder."tenantId" = merchantOrder."tenantId" AND ' +
          'paymentOrder."merchantId" = merchantOrder."merchantId" AND ' +
          'paymentOrder."sourceType" = :sourceType AND ' +
          'paymentOrder."sourceBusinessNo" = merchantOrder."platformOrderId"',
        { sourceType: PaymentSourceType.C2C_BUY },
      )
      .where('merchantOrder."tenantId" = :tenantId', { tenantId: merchant.tenantId })
      .andWhere('merchantOrder."merchantId" = :merchantId', { merchantId: merchant.id })
      .andWhere('merchantOrder.status = :status', { status: MerchantOrderStatus.PENDING_RELEASE })
      .andWhere('merchantOrder."appealStatus" IS NULL')
      .andWhere('merchantOrder."platformCreatedAt" >= :enabledAt', {
        enabledAt: merchant.autoAppealEnabledAt,
      })
      .andWhere(
        '(merchantOrder."autoAppealStatus" IS NULL OR merchantOrder."autoAppealStatus" = :retry)',
        { retry: MerchantOrderAutoAppealStatus.RETRY },
      )
      .andWhere(
        '(merchantOrder."autoAppealNextAttemptAt" IS NULL OR merchantOrder."autoAppealNextAttemptAt" <= :now)',
        { now },
      )
      .andWhere('paymentOrder.status = :paymentStatus', {
        paymentStatus: PaymentOrderStatus.SUCCESS,
      })
      .andWhere('paymentOrder."platformConfirmStatus" = :platformConfirmStatus', {
        platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
      })
      .andWhere('paymentOrder."updatedAt" <= :paidBefore', { paidBefore })
      .orderBy('paymentOrder."updatedAt"', 'ASC')
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
      },
    )
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
