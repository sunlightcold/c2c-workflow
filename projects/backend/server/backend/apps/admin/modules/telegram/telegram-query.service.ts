import {
  createBusinessDayWindow,
  createRelativeBusinessDayWindow,
  getCurrentBusinessDateParts,
} from '@/common/time'
import {
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentOrderStatus,
} from '@admin/database'
import { BadRequestException, Injectable } from '@nestjs/common'
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface TelegramQueryCapabilities {
  canReceipt?: boolean
  canVoid?: boolean
}

@Injectable()
export class TelegramQueryService {
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
    const [row] = (await this.dataSource.query(
      `SELECT COUNT(*)::text AS "totalCount",
              COALESCE(SUM(amount), 0)::text AS "totalAmount",
              COUNT(*) FILTER (WHERE status IN ('PENDING_CONFIG', 'CREATED', 'READY'))::text AS "awaitSubmitCount",
              COUNT(*) FILTER (WHERE status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN'))::text AS "processingCount",
              COUNT(*) FILTER (WHERE status = 'SUCCESS')::text AS "successCount",
              COUNT(*) FILTER (WHERE status IN ('FAILED', 'CANCELLED', 'FUND_EXCEPTION'))::text AS "failedCount",
              COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0)::text AS "successAmount"
       FROM payment_order
       WHERE "tenantId" = $1 AND "merchantId" = $2
         AND "createdAt" >= $3 AND "createdAt" < $4`,
      [tenantId, merchantId, window.start, window.endExclusive],
    )) as Array<{
      awaitSubmitCount: string
      failedCount: string
      processingCount: string
      successAmount: string
      successCount: string
      totalAmount: string
      totalCount: string
    }>
    const total = Number(row?.totalCount ?? 0)
    const success = Number(row?.successCount ?? 0)
    const rate = total ? ((success / total) * 100).toFixed(2) : '0.00'
    return {
      parseMode: 'HTML',
      text:
        `<b>今日代付统计</b>\n` +
        `<i>统计口径：北京时间 00:00 - 当前时间</i>\n\n` +
        `<b>核心指标</b>\n` +
        `成功金额：<code>¥${money(row?.successAmount)}</code>\n` +
        `成功笔数：<code>${success}</code> 笔\n` +
        `成功率：<code>${rate}%</code>\n\n` +
        `<b>订单状态</b>\n` +
        `总计：<code>${total}</code> 笔\n` +
        `待提交：<code>${Number(row?.awaitSubmitCount ?? 0)}</code> 笔 / ` +
        `处理中：<code>${Number(row?.processingCount ?? 0)}</code> 笔\n` +
        `成功：<code>${success}</code> 笔 / ` +
        `失败：<code>${Number(row?.failedCount ?? 0)}</code> 笔\n\n` +
        `<b>金额明细</b>\n` +
        `订单总额：<code>¥${money(row?.totalAmount)}</code>\n` +
        `成功本金：<code>¥${money(row?.successAmount)}</code>`,
    }
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
    const totals = rows.reduce(
      (sum, row) => ({
        count: sum.count + Number(row.orderCount),
        asset: sum.asset + Number(row.assetAmount),
        fiat: sum.fiat + Number(row.fiatAmount),
      }),
      { count: 0, asset: 0, fiat: 0 },
    )
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
        `订单总数：<code>${totals.count}</code> 笔\n` +
        `USDT 总额：<code>${asset(totals.asset)}</code>\n` +
        `法币总额：<code>¥${money(totals.fiat)}</code>\n\n` +
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
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number.toFixed(2) : '0.00'
}

function asset(value: unknown): string {
  const number = Number(value ?? 0)
  return Number.isFinite(number)
    ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(number)
    : '0'
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
