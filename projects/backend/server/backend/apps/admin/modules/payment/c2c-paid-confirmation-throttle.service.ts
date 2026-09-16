import { MerchantPlatform } from '@admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
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

interface Reservation {
  intervalMs: number
  lockId: string
}

@Injectable()
export class C2cPaidConfirmationThrottleService {
  private readonly logger = new Logger(C2cPaidConfirmationThrottleService.name)

  constructor(private readonly dataSource: DataSource) {}

  async execute<T>(merchant: PaidConfirmationMerchant, task: () => Promise<T>): Promise<T> {
    if (merchant.platform !== MerchantPlatform.OKX) return task()
    const [minMs, maxMs] = this.interval(merchant)
    if (maxMs === 0) return task()
    const reservation = await this.reserve(merchant, minMs, maxMs)
    try {
      return await task()
    } finally {
      try {
        await this.release(merchant, reservation)
      } catch (error) {
        this.logger.error(
          `C2C 标记付款节流锁释放失败: merchant=${merchant.code}, error=${this.errorMessage(error)}`,
        )
      }
    }
  }

  private async reserve(
    merchant: PaidConfirmationMerchant,
    minMs: number,
    maxMs: number,
  ): Promise<Reservation> {
    while (true) {
      const lockId = randomUUID()
      const intervalMs = this.randomInterval(minMs, maxMs)
      const leaseMs = (merchant.requestTimeoutMs ?? 15_000) * 4 + 5_000
      const rows = (await this.dataSource.query(
        `
          UPDATE merchant
          SET "paidConfirmLockId" = $3,
              "paidConfirmLockUntil" = NOW() + ($4 * INTERVAL '1 millisecond')
          WHERE id = $1
            AND "tenantId" = $2
            AND platform = 'OKX'
            AND ("paidConfirmLockUntil" IS NULL OR "paidConfirmLockUntil" <= NOW())
            AND ("paidConfirmNextAt" IS NULL OR "paidConfirmNextAt" <= NOW())
          RETURNING id
        `,
        [merchant.id, merchant.tenantId, lockId, leaseMs],
      )) as Array<{ id: string }>
      if (rows.length === 1) return { intervalMs, lockId }

      const [current] = (await this.dataSource.query(
        `
          SELECT "paidConfirmNextAt", "paidConfirmLockUntil"
          FROM merchant
          WHERE id = $1 AND "tenantId" = $2
        `,
        [merchant.id, merchant.tenantId],
      )) as Array<{
        paidConfirmLockUntil: Date | string | null
        paidConfirmNextAt: Date | string | null
      }>
      if (!current) throw new Error(`C2C 商家不存在: ${merchant.code}`)
      const now = Date.now()
      const availableAt = Math.max(
        this.dateValue(current.paidConfirmNextAt) ?? now,
        this.dateValue(current.paidConfirmLockUntil) ?? now,
      )
      await this.sleep(Math.max(25, Math.min(250, availableAt - now)))
    }
  }

  private release(merchant: PaidConfirmationMerchant, reservation: Reservation): Promise<unknown> {
    return this.dataSource.query(
      `
        UPDATE merchant
        SET "paidConfirmNextAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
            "paidConfirmLockId" = NULL,
            "paidConfirmLockUntil" = NULL
        WHERE id = $1 AND "tenantId" = $2 AND "paidConfirmLockId" = $3
      `,
      [merchant.id, merchant.tenantId, reservation.lockId, reservation.intervalMs],
    )
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

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
