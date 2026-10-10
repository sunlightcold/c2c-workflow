import {
  createBusinessDayWindow,
  createCurrentBusinessMonthWindow,
  createRelativeBusinessDayWindow,
  getCurrentBusinessDateParts,
  type RequiredBusinessTimeRange,
} from '@/common/time'
import { formatDecimal, formatTrimmedDecimal } from '@/common/utils/decimal'
import {
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentOrderStatus,
} from '@admin/database'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, In, Repository } from 'typeorm'
import { PaymentReceiptService } from '../payment/payment-receipt.service'
import { C2cReceiptImageService } from '../c2c-order/c2c-receipt-image.service'
import { ReceiptDocumentDownloader } from '../c2c-order/receipt-document-downloader'
import { C2cReportService } from '../c2c-order/c2c-report.service'
import {
  escapeTelegramHtml,
  formatBatchQuery,
  formatOrderQuery,
  type TelegramBatchQueryView,
  type TelegramBotReply,
} from './telegram-query.formatter'
import {
  formatProviderReconciliation,
  type LocalReconciliationOrder,
} from './telegram-statistics.formatter'

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface PaymentStatsRow {
  awaitSubmitAmount: string
  awaitSubmitAssetAmount: string
  awaitSubmitCount: string
  failedAmount: string
  failedAssetAmount: string
  failedCount: string
  processingAmount: string
  processingAssetAmount: string
  processingCount: string
  successAmount: string
  successAssetAmount: string
  successCount: string
  totalAmount: string
  totalAssetAmount: string
  totalCount: string
}

const EMPTY_PAYMENT_STATS: PaymentStatsRow = {
  awaitSubmitAmount: '0',
  awaitSubmitAssetAmount: '0',
  awaitSubmitCount: '0',
  failedAmount: '0',
  failedAssetAmount: '0',
  failedCount: '0',
  processingAmount: '0',
  processingAssetAmount: '0',
  processingCount: '0',
  successAmount: '0',
  successAssetAmount: '0',
  successCount: '0',
  totalAmount: '0',
  totalAssetAmount: '0',
  totalCount: '0',
}

export interface TelegramQueryCapabilities {
  canReceipt?: boolean
  canVoid?: boolean
}

@Injectable()
export class TelegramQueryService {
  private readonly logger = new Logger(TelegramQueryService.name)
  constructor(
    @InjectRepository(PaymentOrderEntity)
    private readonly orders: Repository<PaymentOrderEntity>,
    @InjectRepository(PaymentBatchEntity)
    private readonly batches: Repository<PaymentBatchEntity>,
    private readonly dataSource: DataSource,
    private readonly receipts: PaymentReceiptService,
    private readonly downloader: ReceiptDocumentDownloader,
    private readonly receiptImages: C2cReceiptImageService,
    private readonly c2cReports: C2cReportService,
  ) {}

  async query(
    tenantId: string,
    merchantId: string,
    businessNo: string,
    capabilities: TelegramQueryCapabilities = {},
  ): Promise<TelegramBotReply> {
    const identifier = businessNo.trim()
    if (!identifier) return { text: '请输入订单号或批次号，例如：/query PAY202609140001' }
    const order = await this.findOrder(tenantId, merchantId, identifier)
    if (order) {
      return formatOrderQuery(order, {
        receipt: capabilities.canReceipt && order.status === PaymentOrderStatus.SUCCESS,
        void:
          capabilities.canVoid &&
          [
            PaymentOrderStatus.PENDING_CONFIG,
            PaymentOrderStatus.CREATED,
            PaymentOrderStatus.READY,
          ].includes(order.status),
      })
    }
    return this.queryBatch(tenantId, merchantId, identifier)
  }

  async queryById(
    tenantId: string,
    merchantId: string,
    orderId: string,
    capabilities: TelegramQueryCapabilities = {},
  ): Promise<TelegramBotReply> {
    const order = await this.orders.findOne({ where: { id: orderId, tenantId, merchantId } })
    if (!order) return { text: '未查询到订单或批次' }
    return formatOrderQuery(order, {
      receipt: capabilities.canReceipt && order.status === PaymentOrderStatus.SUCCESS,
      void:
        capabilities.canVoid &&
        [
          PaymentOrderStatus.PENDING_CONFIG,
          PaymentOrderStatus.CREATED,
          PaymentOrderStatus.READY,
        ].includes(order.status),
    })
  }

  async queryBatch(
    tenantId: string,
    merchantId: string,
    identifier: string,
    page = 0,
  ): Promise<TelegramBotReply> {
    const batch = await this.batches.findOne({
      where: [
        { tenantId, merchantId, batchNo: identifier },
        { tenantId, merchantId, upstreamId: identifier },
        ...(uuidPattern.test(identifier) ? [{ tenantId, merchantId, id: identifier }] : []),
      ],
    })
    if (!batch) return { text: '未查询到订单或批次' }
    const items = await this.dataSource.getRepository(PaymentBatchItemEntity).find({
      where: { tenantId, merchantId, batchId: batch.id },
      order: { createdAt: 'ASC' },
    })
    const paymentOrders = items.length
      ? await this.orders.find({
          where: {
            tenantId,
            merchantId,
            id: In(items.map(({ paymentOrderId }) => paymentOrderId)),
          },
        })
      : []
    const orderById = new Map(paymentOrders.map((order) => [order.id, order]))
    const view: TelegramBatchQueryView = {
      ...batch,
      orders: items.map((item) => {
        const order = orderById.get(item.paymentOrderId)
        return {
          amount: item.amount,
          errorMessage: item.errorMessage,
          payeeIdentity: order?.payeeIdentity,
          payeeName: order?.payeeName,
          sourceBusinessNo: order?.sourceBusinessNo,
          status: item.status,
        }
      }),
    }
    return formatBatchQuery(view, page)
  }

  async receipt(
    tenantId: string,
    merchantId: string,
    businessNo: string,
  ): Promise<TelegramBotReply> {
    const identifier = businessNo.trim()
    if (!identifier) return { text: '请输入支付单号或商户订单号，例如：/receipt PAY001' }
    const order = await this.findOrder(tenantId, merchantId, identifier)
    if (!order) return { text: '未查询到支付订单，无法获取回单' }
    const receipt = await this.receipts.getReceipt(tenantId, merchantId, order.id)
    if (receipt.status !== 'READY' || !receipt.downloadUrl)
      return { text: `回单：${receipt.message}` }
    try {
      const document = await this.downloader.download(receipt.downloadUrl)
      const images = await this.receiptImages.convert(document, order.paymentNo)
      return {
        parseMode: 'HTML',
        photos: images.map(({ content, fileName }) => ({ content, fileName })),
        text:
          `<b>付款回单</b>\n` +
          `系统订单号：<code>${escapeTelegramHtml(order.paymentNo)}</code>\n` +
          `支付宝流水号：<code>${escapeTelegramHtml(order.upstreamId || '未返回')}</code>`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'PDF 转 JPG 失败'
      return { text: `回单图片生成失败：${message}` }
    }
  }

  async voidOrder(
    tenantId: string,
    merchantId: string,
    orderId: string,
  ): Promise<TelegramBotReply> {
    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PaymentOrderEntity)
      const order = await repository.findOne({
        where: { id: orderId, tenantId, merchantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!order) return null
      if (
        ![
          PaymentOrderStatus.PENDING_CONFIG,
          PaymentOrderStatus.CREATED,
          PaymentOrderStatus.READY,
        ].includes(order.status)
      ) {
        throw new BadRequestException('资金请求已提交，订单不能作废')
      }
      const previous = order.status
      order.status = PaymentOrderStatus.CANCELLED
      order.lastError = null
      const saved = await manager.save(order)
      await manager.insert(PaymentOrderStatusHistoryEntity, {
        tenantId,
        merchantId,
        paymentOrderId: order.id,
        fromStatus: previous,
        toStatus: PaymentOrderStatus.CANCELLED,
        source: 'TELEGRAM_BOT',
        reason: null,
      })
      return saved
    })
    if (!result) return { text: '支付订单不存在或不属于当前商家' }
    return {
      parseMode: 'HTML',
      text:
        `<b>订单已作废</b>\n` +
        `系统订单号：<code>${escapeTelegramHtml(result.paymentNo)}</code>\n` +
        `商户订单号：<code>${escapeTelegramHtml(result.sourceBusinessNo)}</code>`,
    }
  }

  async todayStats(tenantId: string, merchantId: string): Promise<TelegramBotReply> {
    const window = createRelativeBusinessDayWindow(0)
    return this.paymentStats(
      tenantId,
      merchantId,
      { ...window, endExclusive: new Date() },
      '今日支付统计',
      '北京时间 00:00 - 当前时间',
    )
  }

  async yesterdayStats(tenantId: string, merchantId: string): Promise<TelegramBotReply> {
    return this.paymentStats(
      tenantId,
      merchantId,
      createRelativeBusinessDayWindow(-1),
      '昨日支付统计',
      '北京时间 昨日 00:00 - 今日 00:00',
    )
  }

  async currentMonthStats(tenantId: string, merchantId: string): Promise<TelegramBotReply> {
    return this.paymentStats(
      tenantId,
      merchantId,
      createCurrentBusinessMonthWindow(),
      '当月支付统计',
      '北京时间 本月 1 日 00:00 - 当前时间',
    )
  }

  async dailyReport(
    tenantId: string,
    merchantId: string,
    compactDate?: string,
  ): Promise<TelegramBotReply> {
    const date = compactDate?.trim() || getCurrentBusinessDateParts().compactDate
    if (!/^\d{8}$/.test(date)) throw new BadRequestException('日报日期格式应为 YYYYMMDD')
    const formattedDate = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    const window = createBusinessDayWindow(formattedDate)
    const providerReport = await this.c2cReports.getProviderDailyReport(
      tenantId,
      merchantId,
      window.start,
      window.endExclusive,
    )
    const rows = Object.entries(providerReport.statusSummary).map(([status, summary]) => ({
      status,
      orderCount: String(summary.orderCount),
      assetAmount: summary.assetAmount,
      fiatAmount: summary.fiatAmount,
    }))
    const details = rows.length
      ? rows
          .map(
            (row) =>
              `${merchantOrderStatusLabel(row.status)}：<code>${Number(row.orderCount)}</code> 笔\n` +
              `USDT：<code>${asset(row.assetAmount)}</code>\n` +
              `法币：<code>¥${money(row.fiatAmount)}</code>`,
          )
          .join('\n\n')
      : '暂无订单'
    return {
      parseMode: 'HTML',
      text:
        `<b>C2C 对账日报</b>\n` +
        `日期：<code>${formattedDate}</code>\n` +
        `统计方向：买入 USDT\n\n` +
        `<b>汇总</b>\n` +
        `订单总数：<code>${providerReport.orderCount}</code> 笔\n` +
        `USDT 总额：<code>${asset(providerReport.assetAmount)}</code>\n` +
        `法币总额：<code>¥${money(providerReport.fiatAmount)}</code>\n\n` +
        `<b>明细</b>\n${details}`,
    }
  }

  status(botCode: string, groupName: string): TelegramBotReply {
    return {
      text: [
        `机器人：${botCode}`,
        `当前群组：${groupName}`,
        '机器人状态：启用',
        '群组状态：已绑定',
      ].join('\n'),
    }
  }

  private async paymentStats(
    tenantId: string,
    merchantId: string,
    window: RequiredBusinessTimeRange,
    title: string,
    scope: string,
  ): Promise<TelegramBotReply> {
    const [row] = (await this.dataSource.query(
      `SELECT COUNT(*)::text AS "totalCount",
              COALESCE(SUM(payment_order.amount), 0)::text AS "totalAmount",
              COALESCE(SUM(merchant_order."assetAmount"), 0)::text AS "totalAssetAmount",
              COUNT(*) FILTER (WHERE payment_order.status IN ('PENDING_CONFIG', 'CREATED', 'READY'))::text AS "awaitSubmitCount",
              COALESCE(SUM(merchant_order."assetAmount") FILTER (WHERE payment_order.status IN ('PENDING_CONFIG', 'CREATED', 'READY')), 0)::text AS "awaitSubmitAssetAmount",
              COALESCE(SUM(payment_order.amount) FILTER (WHERE payment_order.status IN ('PENDING_CONFIG', 'CREATED', 'READY')), 0)::text AS "awaitSubmitAmount",
              COUNT(*) FILTER (WHERE payment_order.status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN'))::text AS "processingCount",
              COALESCE(SUM(merchant_order."assetAmount") FILTER (WHERE payment_order.status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN')), 0)::text AS "processingAssetAmount",
              COALESCE(SUM(payment_order.amount) FILTER (WHERE payment_order.status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN')), 0)::text AS "processingAmount",
              COUNT(*) FILTER (WHERE payment_order.status IN ('SUCCESS', 'COMPLETED', 'PLATFORM_CONFIRM_PENDING'))::text AS "successCount",
              COALESCE(SUM(merchant_order."assetAmount") FILTER (WHERE payment_order.status IN ('SUCCESS', 'COMPLETED', 'PLATFORM_CONFIRM_PENDING')), 0)::text AS "successAssetAmount",
              COALESCE(SUM(payment_order.amount) FILTER (WHERE payment_order.status IN ('SUCCESS', 'COMPLETED', 'PLATFORM_CONFIRM_PENDING')), 0)::text AS "successAmount",
              COUNT(*) FILTER (WHERE payment_order.status IN ('FAILED', 'CANCELLED', 'FUND_EXCEPTION'))::text AS "failedCount",
              COALESCE(SUM(merchant_order."assetAmount") FILTER (WHERE payment_order.status IN ('FAILED', 'CANCELLED', 'FUND_EXCEPTION')), 0)::text AS "failedAssetAmount",
              COALESCE(SUM(payment_order.amount) FILTER (WHERE payment_order.status IN ('FAILED', 'CANCELLED', 'FUND_EXCEPTION')), 0)::text AS "failedAmount"
       FROM payment_order
       LEFT JOIN merchant_order ON merchant_order."tenantId" = payment_order."tenantId"
         AND merchant_order."merchantId" = payment_order."merchantId"
         AND merchant_order."platformOrderId" = payment_order."sourceBusinessNo"
       WHERE payment_order."tenantId" = $1 AND payment_order."merchantId" = $2
         AND payment_order."sourceType" = 'C2C_BUY'
         AND payment_order."createdAt" >= $3 AND payment_order."createdAt" < $4`,
      [tenantId, merchantId, window.start, window.endExclusive],
    )) as PaymentStatsRow[]
    const stats = { ...EMPTY_PAYMENT_STATS, ...row }
    const total = Number(stats.totalCount)
    const success = Number(stats.successCount)
    const rate = total ? ((success / total) * 100).toFixed(2) : '0.00'
    const platform = await this.platformStatistics(tenantId, merchantId, window)
    const timestamp = getCurrentBusinessDateParts().compactDateTime
    const summary =
      `<b>${title}</b>\n` +
      `<i>统计口径：${scope}</i>\n\n` +
      `<b>C2C系统统计</b>\n` +
      `成功买入：<code>${statsAsset(stats.successAssetAmount)}</code> USDT\n` +
      `成功付款：<code>¥${money(stats.successAmount)}</code>\n` +
      `成功订单：<code>${success}</code> 笔\n` +
      `成功率：<code>${rate}%</code>\n\n` +
      `<b>订单状态</b>\n` +
      `待支付：<code>${Number(stats.awaitSubmitCount)}</code> 笔 / ` +
      `<code>${statsAsset(stats.awaitSubmitAssetAmount)}</code> USDT / ` +
      `<code>¥${money(stats.awaitSubmitAmount)}</code>\n` +
      `支付中：<code>${Number(stats.processingCount)}</code> 笔 / ` +
      `<code>${statsAsset(stats.processingAssetAmount)}</code> USDT / ` +
      `<code>¥${money(stats.processingAmount)}</code>\n` +
      `支付成功：<code>${success}</code> 笔 / ` +
      `<code>${statsAsset(stats.successAssetAmount)}</code> USDT / ` +
      `<code>¥${money(stats.successAmount)}</code>\n` +
      `失败/作废：<code>${Number(stats.failedCount)}</code> 笔 / ` +
      `<code>${statsAsset(stats.failedAssetAmount)}</code> USDT / ` +
      `<code>¥${money(stats.failedAmount)}</code>\n` +
      `汇总：${total} 笔 / ${statsAsset(stats.totalAssetAmount)} USDT / ¥${money(stats.totalAmount)}\n\n` +
      platform.text
    return {
      parseMode: 'HTML',
      text:
        `${summary}\n\n` +
        `查询时间：${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)} ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)}:${timestamp.slice(12, 14)}`,
    }
  }

  private async platformStatistics(
    tenantId: string,
    merchantId: string,
    window: RequiredBusinessTimeRange,
  ) {
    try {
      const providerOrders = await this.c2cReports.getProviderOrders(
        tenantId,
        merchantId,
        window.start,
        window.endExclusive,
      )
      const localOrders = (await this.dataSource.query(
        `SELECT merchant_order."platformOrderId", merchant_order."assetAmount",
                COALESCE(payment_order.amount, merchant_order."fiatAmount")::text AS "fiatAmount",
                payment_order.status AS "paymentStatus"
         FROM merchant_order
         LEFT JOIN payment_order ON payment_order."tenantId" = merchant_order."tenantId"
           AND payment_order."merchantId" = merchant_order."merchantId"
           AND payment_order."sourceType" = 'C2C_BUY'
           AND payment_order."sourceBusinessNo" = merchant_order."platformOrderId"
         WHERE merchant_order."tenantId" = $1 AND merchant_order."merchantId" = $2
           AND merchant_order.side = 'BUY' AND merchant_order.asset = 'USDT'
           AND merchant_order."fiatCurrency" = 'CNY'
           AND ((merchant_order."platformCreatedAt" >= $3 AND merchant_order."platformCreatedAt" < $4)
             OR merchant_order."platformOrderId" = ANY($5::varchar[]))
         ORDER BY merchant_order."platformCreatedAt", merchant_order."platformOrderId"`,
        [
          tenantId,
          merchantId,
          window.start,
          window.endExclusive,
          providerOrders.map((order) => order.platformOrderId),
        ],
      )) as LocalReconciliationOrder[]
      return formatProviderReconciliation(providerOrders, localOrders)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.logger.warn(
        `机器人平台统计查询失败: tenantId=${tenantId}, merchantId=${merchantId}, reason=${reason}`,
      )
      return {
        text:
          `<b>商家平台统计</b>\n查询失败：${escapeTelegramHtml(reason.slice(0, 400))}\n\n` +
          '<b>对账差异</b>\n核对结果：平台数据不完整，暂无法核对',
      }
    }
  }

  private findOrder(tenantId: string, merchantId: string, identifier: string) {
    return this.orders.findOne({
      where: [
        { tenantId, merchantId, paymentNo: identifier },
        { tenantId, merchantId, sourceBusinessNo: identifier },
        { tenantId, merchantId, upstreamId: identifier },
        ...(uuidPattern.test(identifier) ? [{ tenantId, merchantId, id: identifier }] : []),
      ],
    })
  }
}

function money(value: unknown): string {
  return formatDecimal(value, 2)
}

function asset(value: unknown): string {
  return formatTrimmedDecimal(value, 8)
}

function statsAsset(value: unknown): string {
  return formatTrimmedDecimal(value, 18)
}

function merchantOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    NEW: '新订单',
    PENDING_PAYMENT: '待付款',
    PAID: '已付款待放行',
    UNKNOWN: '未知状态',
    PAYMENT_PROCESSING: '支付处理中',
    PAID_PENDING_PLATFORM_CONFIRM: '待标记付款',
    PENDING_RELEASE: '待放行',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
    EXPIRED: '已过期',
    DISPUTED: '申诉中',
    FUNDS_EXCEPTION: '资金异常',
    EXCEPTION: '异常',
  }
  return escapeTelegramHtml(labels[status] ?? status)
}
