import { formatDecimal } from '@/common/utils/decimal'
import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'

export interface TelegramInlineButton {
  callback_data?: string
  text: string
  url?: string
}

export interface TelegramReplyPhoto {
  content: Buffer
  fileName: string
}

export interface TelegramBotReply {
  parseMode?: 'HTML'
  photos?: TelegramReplyPhoto[]
  replyMarkup?: { inline_keyboard: TelegramInlineButton[][] }
  text: string
}

export interface TelegramOrderQueryView {
  amount: string
  createdAt?: Date | string | null
  currency: string
  id: string
  lastError?: string | null
  payeeIdentity: string
  payeeName: string
  paymentNo: string
  sourceBusinessNo: string
  status: PaymentOrderStatus
  updatedAt?: Date | string | null
}

export interface TelegramBatchOrderQueryView {
  amount: string
  errorMessage?: string | null
  payeeIdentity?: string | null
  payeeName?: string | null
  sourceBusinessNo?: string | null
  status: string
}

export interface TelegramBatchQueryView {
  batchNo: string
  currency: string
  failedCount: number
  lastError?: string | null
  orders: TelegramBatchOrderQueryView[]
  processingCount: number
  status: PaymentBatchStatus
  successCount: number
  totalAmount: string
  totalCount: number
  unknownCount: number
  upstreamId?: string | null
}

export const BATCH_QUERY_PAGE_SIZE = 8

const orderLabels: Record<PaymentOrderStatus, string> = {
  [PaymentOrderStatus.PENDING_CONFIG]: '等待配置',
  [PaymentOrderStatus.CREATED]: '等待提交',
  [PaymentOrderStatus.READY]: '等待提交',
  [PaymentOrderStatus.SUBMITTING]: '提交中',
  [PaymentOrderStatus.PROCESSING]: '处理中',
  [PaymentOrderStatus.UNKNOWN]: '结果未知',
  [PaymentOrderStatus.SUCCESS]: '成功',
  [PaymentOrderStatus.FAILED]: '失败',
  [PaymentOrderStatus.CANCELLED]: '已作废',
  [PaymentOrderStatus.PLATFORM_CONFIRM_PENDING]: '待平台确认',
  [PaymentOrderStatus.COMPLETED]: '成功',
  [PaymentOrderStatus.FUND_EXCEPTION]: '资金异常',
}

const batchLabels: Record<PaymentBatchStatus, string> = {
  [PaymentBatchStatus.DRAFT]: '草稿',
  [PaymentBatchStatus.PENDING_REVIEW]: '等待复核',
  [PaymentBatchStatus.READY]: '等待提交',
  [PaymentBatchStatus.SUBMITTING]: '提交中',
  [PaymentBatchStatus.PROCESSING]: '处理中',
  [PaymentBatchStatus.SUCCESS]: '全部成功',
  [PaymentBatchStatus.PARTIAL_SUCCESS]: '部分成功',
  [PaymentBatchStatus.FAILED]: '全部失败',
  [PaymentBatchStatus.UNKNOWN]: '结果未知',
  [PaymentBatchStatus.CANCELLED]: '已作废',
  [PaymentBatchStatus.EXCEPTION]: '资金异常',
}

export function escapeTelegramHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

export function paymentOrderStatusMeta(status: PaymentOrderStatus) {
  if ([PaymentOrderStatus.SUCCESS, PaymentOrderStatus.COMPLETED].includes(status)) {
    return { icon: '🟢', text: orderLabels[status] }
  }
  if ([PaymentOrderStatus.FAILED, PaymentOrderStatus.FUND_EXCEPTION].includes(status)) {
    return { icon: '🔴', text: orderLabels[status] }
  }
  if (
    [
      PaymentOrderStatus.PENDING_CONFIG,
      PaymentOrderStatus.CREATED,
      PaymentOrderStatus.READY,
      PaymentOrderStatus.CANCELLED,
    ].includes(status)
  ) {
    return { icon: '🟡', text: orderLabels[status] }
  }
  return { icon: '🔵', text: orderLabels[status] }
}

export function paymentBatchStatusMeta(status: PaymentBatchStatus) {
  if (status === PaymentBatchStatus.SUCCESS) return { icon: '🟢', text: batchLabels[status] }
  if (status === PaymentBatchStatus.PARTIAL_SUCCESS)
    return { icon: '🟠', text: batchLabels[status] }
  if ([PaymentBatchStatus.FAILED, PaymentBatchStatus.EXCEPTION].includes(status)) {
    return { icon: '🔴', text: batchLabels[status] }
  }
  if (
    [
      PaymentBatchStatus.DRAFT,
      PaymentBatchStatus.PENDING_REVIEW,
      PaymentBatchStatus.READY,
      PaymentBatchStatus.CANCELLED,
    ].includes(status)
  ) {
    return { icon: '🟡', text: batchLabels[status] }
  }
  return { icon: '🔵', text: batchLabels[status] }
}

export function formatOrderQuery(
  order: TelegramOrderQueryView,
  actions: { receipt?: boolean; void?: boolean } = {},
): TelegramBotReply {
  const status = paymentOrderStatusMeta(order.status)
  const buttons: TelegramInlineButton[] = []
  if (actions.receipt) {
    buttons.push({ text: '获取回单', callback_data: `query:receipt:${order.id}` })
  }
  if (actions.void) {
    buttons.push({ text: '作废订单', callback_data: `query:void:${order.id}` })
  }
  const error =
    [PaymentOrderStatus.FAILED, PaymentOrderStatus.FUND_EXCEPTION].includes(order.status) &&
    order.lastError
      ? `\n\n失败原因：<code>${escapeTelegramHtml(compact(order.lastError, 180))}</code>`
      : ''
  return {
    parseMode: 'HTML',
    text:
      `${status.icon} <b>转账订单</b>\n` +
      `状态：<b>${status.icon} ${status.text}</b>\n\n` +
      `<b>订单信息</b>\n` +
      `商户订单号：<code>${escapeTelegramHtml(order.sourceBusinessNo)}</code>\n` +
      `系统订单号：<code>${escapeTelegramHtml(order.paymentNo)}</code>\n` +
      `金额：<code>${escapeTelegramHtml(money(order.amount))} ${escapeTelegramHtml(order.currency)}</code>\n\n` +
      `<b>收款信息</b>\n` +
      `姓名：<code>${escapeTelegramHtml(order.payeeName)}</code>\n` +
      `账号：<code>${escapeTelegramHtml(order.payeeIdentity)}</code>\n\n` +
      `<b>时间信息</b>\n` +
      `创建时间：<code>${escapeTelegramHtml(dateTime(order.createdAt))}</code>\n` +
      `更新时间：<code>${escapeTelegramHtml(dateTime(order.updatedAt))}</code>${error}`,
    ...(buttons.length ? { replyMarkup: { inline_keyboard: [buttons] } } : {}),
  }
}

export function formatBatchQuery(
  batch: TelegramBatchQueryView,
  requestedPage = 0,
): TelegramBotReply & { page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(batch.orders.length / BATCH_QUERY_PAGE_SIZE))
  const page = Math.min(Math.max(Math.trunc(requestedPage) || 0, 0), totalPages - 1)
  const pageOrders = batch.orders.slice(
    page * BATCH_QUERY_PAGE_SIZE,
    (page + 1) * BATCH_QUERY_PAGE_SIZE,
  )
  const status = paymentBatchStatusMeta(batch.status)
  const details =
    pageOrders
      .map((order) => {
        const orderStatus = batchItemStatusMeta(order.status)
        const receiver = [compact(order.payeeName, 32), compact(order.payeeIdentity, 48)]
          .filter(Boolean)
          .join(' / ')
        return (
          `${orderStatus.icon} 商户订单号：<code>${escapeTelegramHtml(compact(order.sourceBusinessNo, 64))}</code>\n` +
          `收款信息：<code>${escapeTelegramHtml(receiver || '未记录')}</code>\n` +
          `金额：<code>${escapeTelegramHtml(money(order.amount))} ${escapeTelegramHtml(batch.currency)}</code>　` +
          `状态：<b>${orderStatus.text}</b>` +
          (order.errorMessage
            ? `\n失败原因：<code>${escapeTelegramHtml(compact(order.errorMessage, 160))}</code>`
            : '')
        )
      })
      .join('\n\n') || '暂无订单明细'
  const buttons: TelegramInlineButton[] = []
  if (page > 0) {
    buttons.push({ text: '上一页', callback_data: `query:batch:${batch.batchNo}:${page - 1}` })
  }
  if (page + 1 < totalPages) {
    buttons.push({ text: '下一页', callback_data: `query:batch:${batch.batchNo}:${page + 1}` })
  }
  return {
    parseMode: 'HTML',
    page,
    totalPages,
    text:
      `${status.icon} <b>转账批次</b>\n` +
      `状态：<b>${status.icon} ${status.text}</b>\n` +
      `系统批次号：<code>${escapeTelegramHtml(batch.batchNo)}</code>\n` +
      `支付宝批次号：<code>${escapeTelegramHtml(batch.upstreamId || '未返回')}</code>\n` +
      `总金额：<code>${escapeTelegramHtml(money(batch.totalAmount))} ${escapeTelegramHtml(batch.currency)}</code>\n` +
      `总笔数：<code>${escapeTelegramHtml(batch.totalCount)}</code> 笔\n` +
      `成功：<code>${escapeTelegramHtml(batch.successCount)}</code>　失败：<code>${escapeTelegramHtml(batch.failedCount)}</code>　` +
      `处理中：<code>${escapeTelegramHtml(batch.processingCount)}</code>\n\n` +
      `<b>订单明细（${page + 1}/${totalPages}）</b>\n${details}` +
      (batch.lastError
        ? `\n\n批次异常：<code>${escapeTelegramHtml(compact(batch.lastError, 180))}</code>`
        : ''),
    ...(buttons.length ? { replyMarkup: { inline_keyboard: [buttons] } } : {}),
  }
}

function batchItemStatusMeta(status: string) {
  if (status === 'SUCCESS') return { icon: '🟢', text: '成功' }
  if (status === 'FAILED') return { icon: '🔴', text: '失败' }
  if (status === 'CANCELLED') return { icon: '🟡', text: '已作废' }
  if (status === 'UNKNOWN') return { icon: '🔵', text: '结果未知' }
  if (status === 'QUEUED') return { icon: '🟡', text: '等待提交' }
  return { icon: '🔵', text: '处理中' }
}

function compact(value: unknown, maxLength: number): string {
  const text = String(value ?? '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function money(value: unknown): string {
  return formatDecimal(value, 2)
}

function dateTime(value: Date | string | null | undefined): string {
  if (!value) return '未记录'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
    .format(date)
    .replaceAll('/', '-')
}
