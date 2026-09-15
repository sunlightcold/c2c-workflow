import { createRecentBusinessDaysWindow, toBusinessDateSql } from '@/common/time'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type {
  DashboardDailyTrendDto,
  DashboardDistributionDto,
  DashboardMerchantRankingDto,
  DashboardOverviewDto,
  DashboardPlatformDto,
  DashboardSummaryDto,
} from './dashboard.dto'

const PAYMENT_SUCCESS_STATUSES = "'SUCCESS', 'PLATFORM_CONFIRM_PENDING', 'COMPLETED'"

type SummaryRow = Record<keyof DashboardSummaryDto, string>

interface TrendRow {
  date: string
  merchantOrderAmount: string
  merchantOrderCount: string
  paymentAmount: string
  paymentCount: string
  paymentSuccessAmount: string
  paymentSuccessCount: string
}

interface DistributionRow {
  amount: string
  count: string
  key: string
}

interface PlatformRow {
  amount: string
  merchantOrderCount: string
  paidCount: string
  pendingCount: string
  platform: string
}

interface MerchantRankingRow {
  merchantId: string
  merchantName: string
  paymentAmount: string
  paymentCount: string
  platform: string
  successAmount: string
  successCount: string
}

@Injectable()
export class DashboardService {
  constructor(private readonly dataSource: DataSource) {}

  async overview(tenantId: string, days: number, now = new Date()): Promise<DashboardOverviewDto> {
    const window = createRecentBusinessDaysWindow(days, { now })
    const parameters = [tenantId, window.rangeStart, window.rangeEndExclusive]
    const [summaryRows, trendRows, statusRows, sourceRows, platformRows, merchantRows] =
      await Promise.all([
        this.dataSource.query(this.summarySql(), parameters) as Promise<SummaryRow[]>,
        this.dataSource.query(this.trendSql(), [...parameters, window.dates]) as Promise<
          TrendRow[]
        >,
        this.dataSource.query(this.distributionSql('status'), parameters) as Promise<
          DistributionRow[]
        >,
        this.dataSource.query(this.distributionSql('"sourceType"'), parameters) as Promise<
          DistributionRow[]
        >,
        this.dataSource.query(this.platformSql(), parameters) as Promise<PlatformRow[]>,
        this.dataSource.query(this.merchantRankingSql(), parameters) as Promise<
          MerchantRankingRow[]
        >,
      ])
    const summary = summaryRows[0]
    if (!summary) throw new Error('工作台汇总查询未返回结果')

    return {
      generatedAt: now.toISOString(),
      range: {
        days,
        dateFrom: window.dates[0],
        dateTo: window.dates.at(-1)!,
      },
      summary: this.mapSummary(summary),
      dailyTrend: this.mapTrend(window.dates, trendRows),
      paymentStatuses: statusRows.map(this.mapDistribution),
      paymentSources: sourceRows.map(this.mapDistribution),
      platforms: platformRows.map(this.mapPlatform),
      merchantRanking: merchantRows.map(this.mapMerchant),
    }
  }

  private summarySql() {
    return `
      SELECT
        payment."paymentCount", payment."paymentAmount", payment."paymentSuccessCount",
        payment."paymentSuccessAmount", payment."paymentProcessingCount",
        payment."paymentExceptionCount", merchant_order."merchantOrderCount",
        merchant_order."merchantOrderAmount", merchant_order."pendingPaymentCount",
        merchant_order."pendingReleaseCount", batch."batchCount", batch."batchSuccessCount",
        batch."batchProcessingCount", batch."batchExceptionCount",
        (SELECT COUNT(*)::text FROM merchant
          WHERE "tenantId" = $1 AND status = 'active') AS "activeMerchantCount",
        (SELECT COUNT(DISTINCT plan."merchantId")::text
          FROM merchant_payment_plan plan
          INNER JOIN merchant ON merchant.id = plan."merchantId"
            AND merchant."tenantId" = plan."tenantId"
          WHERE plan."tenantId" = $1 AND plan.status = 'active'
            AND plan."automaticPaymentEnabled" = true
            AND merchant.status = 'active') AS "automatedMerchantCount",
        (SELECT COUNT(*)::text FROM telegram_bot
          WHERE "tenantId" = $1 AND status = 'active' AND "runtimeEnabled" = true) AS "activeBotCount",
        (SELECT COUNT(*)::text FROM telegram_group
          WHERE "tenantId" = $1 AND "bindingState" = 'ACTIVE') AS "activeGroupCount"
      FROM (
        SELECT COUNT(*)::text AS "paymentCount",
          COALESCE(SUM(amount), 0)::text AS "paymentAmount",
          COUNT(*) FILTER (WHERE status IN (${PAYMENT_SUCCESS_STATUSES}))::text AS "paymentSuccessCount",
          COALESCE(SUM(amount) FILTER (WHERE status IN (${PAYMENT_SUCCESS_STATUSES})), 0)::text AS "paymentSuccessAmount",
          COUNT(*) FILTER (WHERE status IN ('SUBMITTING', 'PROCESSING', 'PLATFORM_CONFIRM_PENDING'))::text AS "paymentProcessingCount",
          COUNT(*) FILTER (WHERE status IN ('UNKNOWN', 'FAILED', 'FUND_EXCEPTION'))::text AS "paymentExceptionCount"
        FROM payment_order
        WHERE "tenantId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
      ) payment
      CROSS JOIN (
        SELECT COUNT(*)::text AS "merchantOrderCount",
          COALESCE(SUM("fiatAmount"), 0)::text AS "merchantOrderAmount",
          COUNT(*) FILTER (WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING'))::text AS "pendingPaymentCount",
          COUNT(*) FILTER (WHERE status IN ('PAID_PENDING_PLATFORM_CONFIRM', 'PENDING_RELEASE'))::text AS "pendingReleaseCount"
        FROM merchant_order
        WHERE "tenantId" = $1 AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3
      ) merchant_order
      CROSS JOIN (
        SELECT COUNT(*)::text AS "batchCount",
          COUNT(*) FILTER (WHERE status = 'SUCCESS')::text AS "batchSuccessCount",
          COUNT(*) FILTER (WHERE status IN ('SUBMITTING', 'PROCESSING'))::text AS "batchProcessingCount",
          COUNT(*) FILTER (WHERE status IN ('UNKNOWN', 'FAILED', 'PARTIAL_SUCCESS', 'EXCEPTION'))::text AS "batchExceptionCount"
        FROM payment_batch
        WHERE "tenantId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
      ) batch
    `
  }

  private trendSql() {
    const paymentDate = toBusinessDateSql('payment_order."createdAt"')
    const merchantOrderDate = toBusinessDateSql('merchant_order."platformCreatedAt"')
    return `
      WITH dates AS (
        SELECT UNNEST($4::text[]) AS date
      ), payment_daily AS (
        SELECT ${paymentDate} AS date,
          COUNT(*)::text AS "paymentCount",
          COALESCE(SUM(amount), 0)::text AS "paymentAmount",
          COUNT(*) FILTER (WHERE status IN (${PAYMENT_SUCCESS_STATUSES}))::text AS "paymentSuccessCount",
          COALESCE(SUM(amount) FILTER (WHERE status IN (${PAYMENT_SUCCESS_STATUSES})), 0)::text AS "paymentSuccessAmount"
        FROM payment_order
        WHERE "tenantId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
        GROUP BY 1
      ), merchant_order_daily AS (
        SELECT ${merchantOrderDate} AS date,
          COUNT(*)::text AS "merchantOrderCount",
          COALESCE(SUM("fiatAmount"), 0)::text AS "merchantOrderAmount"
        FROM merchant_order
        WHERE "tenantId" = $1 AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3
        GROUP BY 1
      )
      SELECT dates.date,
        COALESCE(payment_daily."paymentCount", '0') AS "paymentCount",
        COALESCE(payment_daily."paymentAmount", '0') AS "paymentAmount",
        COALESCE(payment_daily."paymentSuccessCount", '0') AS "paymentSuccessCount",
        COALESCE(payment_daily."paymentSuccessAmount", '0') AS "paymentSuccessAmount",
        COALESCE(merchant_order_daily."merchantOrderCount", '0') AS "merchantOrderCount",
        COALESCE(merchant_order_daily."merchantOrderAmount", '0') AS "merchantOrderAmount"
      FROM dates
      LEFT JOIN payment_daily USING (date)
      LEFT JOIN merchant_order_daily USING (date)
      ORDER BY dates.date
    `
  }

  private distributionSql(column: '"sourceType"' | 'status') {
    return `
      SELECT ${column}::text AS key, COUNT(*)::text AS count,
        COALESCE(SUM(amount), 0)::text AS amount
      FROM payment_order
      WHERE "tenantId" = $1 AND "createdAt" >= $2 AND "createdAt" < $3
      GROUP BY ${column}
      ORDER BY COUNT(*) DESC, ${column}
    `
  }

  private platformSql() {
    return `
      SELECT platform::text AS platform, COUNT(*)::text AS "merchantOrderCount",
        COALESCE(SUM("fiatAmount"), 0)::text AS amount,
        COUNT(*) FILTER (WHERE status IN ('PAID_PENDING_PLATFORM_CONFIRM', 'PENDING_RELEASE', 'COMPLETED'))::text AS "paidCount",
        COUNT(*) FILTER (WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING'))::text AS "pendingCount"
      FROM merchant_order
      WHERE "tenantId" = $1 AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3
      GROUP BY platform
      ORDER BY COUNT(*) DESC, platform
    `
  }

  private merchantRankingSql() {
    return `
      SELECT merchant.id AS "merchantId", merchant.name AS "merchantName",
        merchant.platform::text AS platform, COUNT(payment_order.id)::text AS "paymentCount",
        COALESCE(SUM(payment_order.amount), 0)::text AS "paymentAmount",
        COUNT(payment_order.id) FILTER (WHERE payment_order.status IN (${PAYMENT_SUCCESS_STATUSES}))::text AS "successCount",
        COALESCE(SUM(payment_order.amount) FILTER (WHERE payment_order.status IN (${PAYMENT_SUCCESS_STATUSES})), 0)::text AS "successAmount"
      FROM merchant
      INNER JOIN payment_order
        ON payment_order."tenantId" = merchant."tenantId"
       AND payment_order."merchantId" = merchant.id
       AND payment_order."createdAt" >= $2 AND payment_order."createdAt" < $3
      WHERE merchant."tenantId" = $1
      GROUP BY merchant.id, merchant.name, merchant.platform
      ORDER BY SUM(payment_order.amount) FILTER (WHERE payment_order.status IN (${PAYMENT_SUCCESS_STATUSES})) DESC NULLS LAST,
        COUNT(payment_order.id) DESC, merchant.id
      LIMIT 8
    `
  }

  private mapSummary(row: SummaryRow): DashboardSummaryDto {
    const paymentCount = numeric(row.paymentCount)
    const paymentSuccessCount = numeric(row.paymentSuccessCount)
    return {
      activeBotCount: numeric(row.activeBotCount),
      activeGroupCount: numeric(row.activeGroupCount),
      activeMerchantCount: numeric(row.activeMerchantCount),
      automatedMerchantCount: numeric(row.automatedMerchantCount),
      batchCount: numeric(row.batchCount),
      batchExceptionCount: numeric(row.batchExceptionCount),
      batchProcessingCount: numeric(row.batchProcessingCount),
      batchSuccessCount: numeric(row.batchSuccessCount),
      merchantOrderAmount: money(row.merchantOrderAmount),
      merchantOrderCount: numeric(row.merchantOrderCount),
      pendingPaymentCount: numeric(row.pendingPaymentCount),
      pendingReleaseCount: numeric(row.pendingReleaseCount),
      paymentAmount: money(row.paymentAmount),
      paymentCount,
      paymentExceptionCount: numeric(row.paymentExceptionCount),
      paymentProcessingCount: numeric(row.paymentProcessingCount),
      paymentSuccessAmount: money(row.paymentSuccessAmount),
      paymentSuccessCount,
      paymentSuccessRate: paymentCount
        ? ((paymentSuccessCount / paymentCount) * 100).toFixed(2)
        : '0.00',
    }
  }

  private mapTrend(dates: string[], rows: TrendRow[]): DashboardDailyTrendDto[] {
    const byDate = new Map(rows.map((row) => [row.date, row]))
    return dates.map((date) => {
      const row = byDate.get(date)
      return {
        date,
        merchantOrderAmount: money(row?.merchantOrderAmount),
        merchantOrderCount: numeric(row?.merchantOrderCount),
        paymentAmount: money(row?.paymentAmount),
        paymentCount: numeric(row?.paymentCount),
        paymentSuccessAmount: money(row?.paymentSuccessAmount),
        paymentSuccessCount: numeric(row?.paymentSuccessCount),
      }
    })
  }

  private mapDistribution = (row: DistributionRow): DashboardDistributionDto => ({
    amount: money(row.amount),
    count: numeric(row.count),
    key: row.key,
  })

  private mapPlatform = (row: PlatformRow): DashboardPlatformDto => ({
    amount: money(row.amount),
    merchantOrderCount: numeric(row.merchantOrderCount),
    paidCount: numeric(row.paidCount),
    pendingCount: numeric(row.pendingCount),
    platform: row.platform,
  })

  private mapMerchant = (row: MerchantRankingRow): DashboardMerchantRankingDto => {
    const paymentCount = numeric(row.paymentCount)
    const successCount = numeric(row.successCount)
    return {
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      paymentAmount: money(row.paymentAmount),
      paymentCount,
      platform: row.platform,
      successAmount: money(row.successAmount),
      successCount,
      successRate: paymentCount ? ((successCount / paymentCount) * 100).toFixed(2) : '0.00',
    }
  }
}

function numeric(value: unknown): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: unknown): string {
  return numeric(value).toFixed(2)
}
