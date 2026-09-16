import { MerchantPlatform } from '@admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { DataSource } from 'typeorm'

export interface PaidConfirmationMerchant {
  id: string
  tenantId: string
  code?: string
  platform: MerchantPlatform
  paidConfirmIntervalMinMs?: number
  paidConfirmIntervalMaxMs?: number
  requestTimeoutMs?: number
}

export interface PaidConfirmationCorrelation {
  merchantOrderId: string
  platformOrderId: string
  paymentOrderId: string
  paymentNo: string
  paymentUpstreamId?: string | null
  batchId?: string
  batchNo?: string
  batchUpstreamId?: string | null
}

@Injectable()
export class C2cPaidConfirmationThrottleService {
  private readonly logger = new Logger(C2cPaidConfirmationThrottleService.name)

  constructor(private readonly dataSource: DataSource) {}

  async execute<T>(
    merchant: PaidConfirmationMerchant,
    task: () => Promise<T>,
    correlation?: PaidConfirmationCorrelation,
  ): Promise<T> {
    if (merchant.platform !== MerchantPlatform.OKX) return task()
    const [minMs, maxMs] = this.interval(merchant)
    if (maxMs === 0) return task()
    await this.reserveSlot(merchant, minMs, maxMs, correlation)
    return task()
  }

  private async reserveSlot(
    merchant: PaidConfirmationMerchant,
    minMs: number,
    maxMs: number,
    correlation?: PaidConfirmationCorrelation,
  ): Promise<void> {
    while (true) {
      const intervalMs = this.randomInterval(minMs, maxMs)
      const [rows] = (await this.dataSource.query(
        `
          UPDATE merchant
          SET "paidConfirmNextAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
              "paidConfirmLockId" = NULL,
              "paidConfirmLockUntil" = NULL
          WHERE id = $1
            AND "tenantId" = $2
            AND platform = 'OKX'
            AND ("paidConfirmNextAt" IS NULL OR "paidConfirmNextAt" <= NOW())
          RETURNING id
        `,
        [merchant.id, merchant.tenantId, intervalMs],
      )) as [Array<{ id: string }>, number]
      if (rows.length === 1) return

      const [current] = (await this.dataSource.query(
        `
          SELECT "paidConfirmNextAt"
          FROM merchant
          WHERE id = $1 AND "tenantId" = $2
        `,
        [merchant.id, merchant.tenantId],
      )) as Array<{
        paidConfirmNextAt: Date | string | null
      }>
      if (!current) throw new Error(`C2C 商家不存在: ${merchant.code}`)
      const now = Date.now()
      const availableAt = this.dateValue(current.paidConfirmNextAt) ?? now
      const waitMs = Math.max(25, availableAt - now)
      this.logger.log(
        `C2C 标记付款等待节流窗口: ${this.correlationLogContext(merchant, correlation)}, waitMs=${waitMs}`,
      )
      await this.sleep(waitMs)
    }
  }

  private interval(merchant: PaidConfirmationMerchant): [number, number] {
    const minMs = merchant.paidConfirmIntervalMinMs ?? 2_000
    const maxMs = merchant.paidConfirmIntervalMaxMs ?? 3_000
    if (
      !Number.isInteger(minMs) ||
      !Number.isInteger(maxMs) ||
      minMs < 0 ||
      maxMs < minMs ||
      maxMs > 60_000
    ) {
      throw new Error(`C2C 标记付款间隔配置无效: merchant=${merchant.code}`)
    }
    return [minMs, maxMs]
  }

  private correlationLogContext(
    merchant: PaidConfirmationMerchant,
    correlation?: PaidConfirmationCorrelation,
  ): string {
    return [
      `tenantId=${merchant.tenantId}`,
      `merchantId=${merchant.id}`,
      `merchantCode=${merchant.code ?? 'unknown'}`,
      `merchantOrderId=${correlation?.merchantOrderId ?? 'unknown'}`,
      `platformOrderId=${correlation?.platformOrderId ?? 'unknown'}`,
      `paymentOrderId=${correlation?.paymentOrderId ?? 'unknown'}`,
      `paymentNo=${correlation?.paymentNo ?? 'unknown'}`,
      `paymentUpstreamId=${correlation?.paymentUpstreamId ?? 'none'}`,
      `batchId=${correlation?.batchId ?? 'none'}`,
      `batchNo=${correlation?.batchNo ?? 'none'}`,
      `batchUpstreamId=${correlation?.batchUpstreamId ?? 'none'}`,
    ].join(', ')
  }

  private randomInterval(minMs: number, maxMs: number): number {
    return minMs === maxMs ? minMs : minMs + Math.floor(Math.random() * (maxMs - minMs + 1))
  }

  private dateValue(value: Date | string | null): number | undefined {
    if (!value) return undefined
    const timestamp = new Date(value).getTime()
    return Number.isFinite(timestamp) ? timestamp : undefined
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
