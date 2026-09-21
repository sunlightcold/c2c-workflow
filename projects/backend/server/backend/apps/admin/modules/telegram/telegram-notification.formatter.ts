import { PaymentBatchStatus, PaymentOrderStatus, MerchantOrderStatus } from '@admin/database'

export interface TelegramOrderMessageInput {
  platformOrderId: string
  fiatAmount: string
  fiatCurrency: string
  asset: string
  assetAmount: string
  status: string
  payeeName?: string | null
  payeeIdentity?: string | null
  paymentMethod?: string | null
  identityName?: string | null
  identityMatched: boolean
  payable: boolean
  lastError?: string | null
}

export interface TelegramPaymentMessageInput {
  paymentNo: string
  sourceBusinessNo?: string | null
  amount?: string | null
  currency?: string | null
  paymentMethod?: string | null
  payeeName?: string | null
  payeeIdentity?: string | null
  status: string
  upstreamId?: string | null
  errorMessage?: string | null
}

export interface TelegramC2cCreatedMessageInput {
  merchantOrderId: string
  paymentOrderId?: string
  platformOrderId: string
  paymentNo?: string | null
  fiatAmount: string
  fiatCurrency: string
  asset?: string | null
  assetAmount?: string | null
  payeeName?: string | null
  payeeIdentity?: string | null
  paymentMethod?: string | null
  identityName?: string | null
  identityMatched: boolean
  kycStatus?: string | null
  status: string
  upstreamId?: string | null
  errorMessage?: string | null
}

export interface TelegramBatchMessageInput {
  batchNo: string
  automatic?: boolean
  currency?: string | null
  status: string
  totalCount: number
  totalAmount: string
  successCount: number
  successAmount: string
  failedCount: number
  failedAmount: string
  failedDetails?: string
}

export interface TelegramBatchSubmittedMessageInput {
  totalCount: number
  totalAmount: string
  groups: number
  submitted: number
  failed: number
  errors?: string[]
}

export function formatAutomaticBatchSubmissionMessage(
  batch: TelegramBatchSubmittedMessageInput,
): string {
  const message =
    `<b>自动批次提交结果</b>\n\n` +
    `本次提交订单：<code>${escapeTelegramHtml(batch.totalCount)}</code> 笔\n` +
    `订单总金额：<code>¥${escapeTelegramHtml(money(batch.totalAmount))}</code>\n` +
    `发现批次组：<code>${escapeTelegramHtml(batch.groups)}</code>\n` +
    `已提交批次：<code>${escapeTelegramHtml(batch.submitted)}</code>\n` +
    `失败批次：<code>${escapeTelegramHtml(batch.failed)}</code>`
  return batch.errors?.length
    ? `${message}\n失败原因：\n${batch.errors.map((error) => `- ${escapeTelegramHtml(error)}`).join('\n')}`
    : message
}

export interface TelegramManualConfirmationInput {
  sourceBusinessNo: string
  amount: string
  payeeName: string
  payeeIdentity: string
}

export function formatManualPaymentConfirmation(
  payments: TelegramManualConfirmationInput[],
): string {
  if (payments.length === 1) {
    const payment = payments[0]
    return (
      `<b>请确认转账信息</b>\n\n` +
      `商户订单号：<code>${escapeTelegramHtml(payment.sourceBusinessNo)}</code>\n` +
      `金额：<code>${escapeTelegramHtml(money(payment.amount))} CNY</code>\n` +
      `姓名：<code>${escapeTelegramHtml(payment.payeeName)}</code>\n` +
      `账号：<code>${escapeTelegramHtml(payment.payeeIdentity)}</code>`
    )
  }
  const total = sumMoney(payments.map(({ amount }) => amount))
  const details = payments
    .map(
      (payment, index) =>
        `${index + 1}.\n` +
        `商户订单号：<code>${escapeTelegramHtml(payment.sourceBusinessNo)}</code>\n` +
        `金额：<code>¥${escapeTelegramHtml(money(payment.amount))} CNY</code>\n` +
        `姓名：<code>${escapeTelegramHtml(payment.payeeName)}</code>\n` +
        `账号：<code>${escapeTelegramHtml(payment.payeeIdentity)}</code>`,
    )
    .join('\n\n')
  return (
    `<b>请确认批量下单</b>\n\n` +
    `订单笔数：<code>${payments.length}</code> 笔\n` +
    `订单总金额：<code>¥${escapeTelegramHtml(total)} CNY</code>\n\n` +
    details
  )
}

export function formatManualPaymentAcceptedMessage(order: {
  id: string
  paymentNo: string
  sourceBusinessNo: string
  amount: string
  payeeName: string
  payeeIdentity: string
  status: string
}): string {
  const meta = paymentStatusMeta(order.status)
  const statusText = ['PENDING_CONFIG', 'CREATED', 'READY'].includes(order.status)
    ? '等待批次提交'
    : meta.text
  return (
    `${meta.icon} <b>订单已受理</b>\n` +
    `商户订单号：<code>${escapeTelegramHtml(order.sourceBusinessNo)}</code>\n` +
    `收款信息：<code>${escapeTelegramHtml(`${order.payeeName} / ${order.payeeIdentity}`)}</code>\n` +
    `金额：<code>${escapeTelegramHtml(money(order.amount))} CNY</code>\n` +
    `状态：<b>${escapeTelegramHtml(statusText)}</b>`
  )
}

const PAYMENT_TERMINAL_STATUSES = new Set<string>([
  PaymentOrderStatus.SUCCESS,
  PaymentOrderStatus.FAILED,
  PaymentOrderStatus.CANCELLED,
  PaymentOrderStatus.FUND_EXCEPTION,
])

const PAYMENT_CREATED_STATUSES = new Set<string>([
  PaymentOrderStatus.PENDING_CONFIG,
  PaymentOrderStatus.READY,
])

const BATCH_TERMINAL_STATUSES = new Set<string>([
  PaymentBatchStatus.SUCCESS,
  PaymentBatchStatus.PARTIAL_SUCCESS,
  PaymentBatchStatus.FAILED,
  PaymentBatchStatus.CANCELLED,
  PaymentBatchStatus.EXCEPTION,
])

export function shouldNotifyPaymentStatus(status: string): boolean {
  return PAYMENT_TERMINAL_STATUSES.has(status) || PAYMENT_CREATED_STATUSES.has(status)
}

export function shouldNotifyBatchStatus(status: string): boolean {
  return BATCH_TERMINAL_STATUSES.has(status)
}

/**
 * A payable, identity-matched C2C order is handled by the automatic payment
 * worker. It must stay silent at discovery time; only a reviewable order needs
 * a human-facing notification.
 */
export function shouldNotifyOrderDiscovered(
  order: Pick<TelegramOrderMessageInput, 'status' | 'identityMatched' | 'payable'>,
) {
  if (order.status === MerchantOrderStatus.PENDING_PAYMENT) {
    return !order.identityMatched && order.payable
  }
  return [
    MerchantOrderStatus.DISPUTED,
    MerchantOrderStatus.EXCEPTION,
    MerchantOrderStatus.EXPIRED,
    MerchantOrderStatus.CANCELLED,
    MerchantOrderStatus.FUNDS_EXCEPTION,
  ].includes(order.status as MerchantOrderStatus)
}

export function escapeTelegramHtml(value: unknown): string {
  const text =
    value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value)
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function money(value: unknown): string {
  const text = String(value ?? '0').trim()
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
  if (!match) return '0.00'
  const [, sign, whole, fraction = ''] = match
  const cents = `${fraction}00`.slice(0, 2)
  return `${sign === '-' ? '-' : ''}${whole}.${cents}`
}

export function sumMoney(values: unknown[]): string {
  const cents = values.reduce<bigint>((sum, value) => {
    const text = String(value ?? '0').trim()
    const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
    if (!match) return sum
    const [, sign, whole, fraction = ''] = match
    const amount = BigInt(`${whole}${`${fraction}00`.slice(0, 2)}`)
    return sum + (sign === '-' ? -amount : amount)
  }, 0n)
  const sign = cents < 0n ? '-' : ''
  const absolute = cents < 0n ? -cents : cents
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`
}

function paymentMethodLabel(value: string | null | undefined): string {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
  const labels: Record<string, string> = {
    ALIPAY: '支付宝',
    ALI_PAY: '支付宝',
    BANK: '银行卡',
    BANK_CARD: '银行卡',
    WECHAT: '微信支付',
    WECHAT_PAY: '微信支付',
  }
  return labels[normalized] ?? value?.trim() ?? '未记录'
}

function compact(value: unknown, maxLength: number): string {
  const text = String(value ?? '')
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text
}

function orderStatusMeta(status: string): { icon: string; text: string } {
  if (status === MerchantOrderStatus.PENDING_PAYMENT) return { icon: '🔴', text: '不一致' }
  if (status === MerchantOrderStatus.DISPUTED) return { icon: '🟠', text: '争议中' }
  if (status === MerchantOrderStatus.EXPIRED) return { icon: '🟠', text: '已过期' }
  if (status === MerchantOrderStatus.CANCELLED) return { icon: '🟠', text: '已取消' }
  if (status === MerchantOrderStatus.FUNDS_EXCEPTION) return { icon: '🔴', text: '资金异常' }
  if (status === MerchantOrderStatus.EXCEPTION) return { icon: '🔴', text: '系统异常' }
  return { icon: '🔵', text: status }
}

export function paymentStatusMeta(status: string): { icon: string; text: string } {
  const labels: Record<string, { icon: string; text: string }> = {
    [PaymentOrderStatus.PENDING_CONFIG]: { icon: '🟡', text: '等待配置' },
    [PaymentOrderStatus.CREATED]: { icon: '🟡', text: '等待提交' },
    [PaymentOrderStatus.READY]: { icon: '🔵', text: '已创建，待处理' },
    [PaymentOrderStatus.SUBMITTING]: { icon: '🔵', text: '提交中' },
    [PaymentOrderStatus.PROCESSING]: { icon: '🔵', text: '处理中' },
    [PaymentOrderStatus.UNKNOWN]: { icon: '🔵', text: '结果未知' },
    [PaymentOrderStatus.SUCCESS]: { icon: '🟢', text: '成功' },
    [PaymentOrderStatus.COMPLETED]: { icon: '🟢', text: '成功' },
    [PaymentOrderStatus.FAILED]: { icon: '🔴', text: '失败' },
    [PaymentOrderStatus.CANCELLED]: { icon: '🟠', text: '已作废' },
    [PaymentOrderStatus.PLATFORM_CONFIRM_PENDING]: { icon: '🟠', text: '待平台确认' },
    [PaymentOrderStatus.FUND_EXCEPTION]: { icon: '🔴', text: '资金异常' },
  }
  return labels[status] ?? { icon: '🔵', text: '处理中' }
}

function batchStatusMeta(status: string): { icon: string; text: string } {
  if (status === PaymentBatchStatus.SUCCESS) return { icon: '🟢', text: '全部成功' }
  if (status === PaymentBatchStatus.PARTIAL_SUCCESS) return { icon: '🟠', text: '部分成功' }
  if (status === PaymentBatchStatus.CANCELLED) return { icon: '🟠', text: '已取消' }
  if (status === PaymentBatchStatus.EXCEPTION) return { icon: '🔴', text: '异常' }
  return { icon: '🔴', text: '全部失败' }
}

export function formatOrderDiscoveredMessage(order: TelegramOrderMessageInput): string {
  const meta = orderStatusMeta(order.status)
  const kycStatus = order.lastError === '卖方 KYC 未通过' ? 'FAIL' : 'PASS'
  return (
    `🔴 <b>实名不一致，等待确认</b>\n\n` +
    `<b>订单信息</b>\n` +
    `商家订单号：<code>${escapeTelegramHtml(order.platformOrderId)}</code>\n` +
    `金额：<code>${escapeTelegramHtml(money(order.fiatAmount))} ${escapeTelegramHtml(order.fiatCurrency)}</code>\n` +
    `资产：<code>${escapeTelegramHtml(order.asset)}</code>\n\n` +
    `<b>收款信息</b>\n` +
    `姓名：<code>${escapeTelegramHtml(order.identityName || '未记录')}</code>\n` +
    `账号：<code>${escapeTelegramHtml(order.payeeIdentity || '未记录')}</code>\n` +
    `方式：<code>${escapeTelegramHtml(paymentMethodLabel(order.paymentMethod))}</code>\n\n` +
    `<b>实名核验</b>\n` +
    `KYC：<code>${escapeTelegramHtml(kycStatus)}</code>\n` +
    `实名：<code>${escapeTelegramHtml(order.identityName || '未记录')}</code>\n` +
    `持有人：<code>${escapeTelegramHtml(order.payeeName || '未记录')}</code>\n` +
    `结果：<b>${escapeTelegramHtml(meta.text)}</b>`
  )
}

export function formatC2cCreatedMessage(order: TelegramC2cCreatedMessageInput): string {
  const title = order.identityMatched ? 'C2C订单已自动创建' : '实名不一致，等待确认'
  const icon = order.identityMatched ? '🟢' : '🔴'
  const result = order.identityMatched ? '一致，已自动下单' : '不一致，等待人工确认'
  return (
    `${icon} <b>${title}</b>\n\n` +
    `<b>订单信息</b>\n` +
    `商家订单号：<code>${escapeTelegramHtml(order.platformOrderId)}</code>\n` +
    `系统订单号：<code>${escapeTelegramHtml(order.paymentNo || order.paymentOrderId || '未生成')}</code>\n` +
    `金额：<code>${escapeTelegramHtml(money(order.fiatAmount))} ${escapeTelegramHtml(order.fiatCurrency)}</code>` +
    `\n\n<b>收款信息</b>\n` +
    `姓名：<code>${escapeTelegramHtml(order.identityName || '未记录')}</code>\n` +
    `账号：<code>${escapeTelegramHtml(order.payeeIdentity || '未记录')}</code>\n` +
    `方式：<code>${escapeTelegramHtml(paymentMethodLabel(order.paymentMethod))}</code>\n\n` +
    `<b>实名核验</b>\n` +
    `KYC：<code>${escapeTelegramHtml(order.kycStatus || 'PASS')}</code>\n` +
    `持有人：<code>${escapeTelegramHtml(order.payeeName || '未记录')}</code>\n` +
    `结果：<b>${escapeTelegramHtml(result)}</b>`
  )
}

export function formatPaymentStatusMessage(payment: TelegramPaymentMessageInput): string {
  const meta = paymentStatusMeta(payment.status)
  const lines = [`${meta.icon} <b>转账${meta.text}</b>\n`, `<b>订单信息</b>`]
  if (payment.sourceBusinessNo)
    lines.push(`商家订单号：<code>${escapeTelegramHtml(payment.sourceBusinessNo)}</code>`)
  lines.push(`系统订单号：<code>${escapeTelegramHtml(payment.paymentNo)}</code>`)
  if (payment.amount)
    lines.push(
      `金额：<code>${escapeTelegramHtml(money(payment.amount))} ${escapeTelegramHtml(payment.currency || 'CNY')}</code>`,
    )
  lines.push('', '<b>收款信息</b>')
  lines.push(`姓名：<code>${escapeTelegramHtml(payment.payeeName || '未记录')}</code>`)
  lines.push(`账号：<code>${escapeTelegramHtml(payment.payeeIdentity || '未记录')}</code>`)
  lines.push('', `状态：<b>${meta.icon} ${escapeTelegramHtml(meta.text)}</b>`)
  if (payment.upstreamId)
    lines.push(`平台流水号：<code>${escapeTelegramHtml(payment.upstreamId)}</code>`)
  if (payment.errorMessage)
    lines.push(`失败原因：<code>${escapeTelegramHtml(compact(payment.errorMessage, 240))}</code>`)
  return lines.join('\n')
}

export function formatBatchStatusMessage(batch: TelegramBatchMessageInput): string {
  const meta = batchStatusMeta(batch.status)
  const currency = escapeTelegramHtml(batch.currency || 'CNY')
  const title = batch.automatic ? '自动批次处理结果' : '批次处理结果'
  const message =
    `${meta.icon} <b>${title}</b>\n` +
    `批次号：<code>${escapeTelegramHtml(batch.batchNo)}</code>\n` +
    `状态：<b>${meta.icon} ${escapeTelegramHtml(meta.text)}</b>\n` +
    `总金额：<code>${escapeTelegramHtml(money(batch.totalAmount))} ${currency}</code>\n` +
    `总笔数：<code>${escapeTelegramHtml(batch.totalCount)}</code> 笔\n` +
    `成功：<code>${escapeTelegramHtml(batch.successCount)}</code> 笔 / <code>${escapeTelegramHtml(money(batch.successAmount))} ${currency}</code>\n` +
    `失败：<code>${escapeTelegramHtml(batch.failedCount)}</code> 笔 / <code>${escapeTelegramHtml(money(batch.failedAmount))} ${currency}</code>`
  return batch.failedDetails ? `${message}\n\n🔴 <b>失败明细</b>${batch.failedDetails}` : message
}

export function formatExceptionMessage(
  code: string,
  message: string,
  referenceId?: string,
  details?: { platform?: string; merchantNo?: string },
): string {
  if (code === 'C2C_PAYMENT_ORDER_NOT_CREATED') {
    return (
      `🔴 <b>无法创建支付订单</b>\n\n` +
      (referenceId ? `商家订单号：<code>${escapeTelegramHtml(referenceId)}</code>\n` : '') +
      `原因：<code>${escapeTelegramHtml(compact(message, 400))}</code>`
    )
  }
  if (code === 'C2C_CREDENTIAL_REJECTED') {
    return (
      `<b>⚠️ C2C 凭证失效，账号已停用</b>\n\n` +
      (details?.platform
        ? `平台：<code>${escapeTelegramHtml(platformLabel(details.platform))}</code>\n`
        : '') +
      (referenceId ? `账号：<code>${escapeTelegramHtml(referenceId)}</code>\n` : '') +
      (details?.merchantNo
        ? `商户号：<code>${escapeTelegramHtml(details.merchantNo)}</code>\n`
        : '') +
      `原因：<code>${escapeTelegramHtml(compact(message, 400))}</code>\n\n` +
      `请在后台更新该账号的凭证后，将账号重新启用。`
    )
  }
  return (
    `🔴 <b>支付异常通知</b>\n\n` +
    `错误码：<code>${escapeTelegramHtml(code)}</code>\n` +
    `原因：<code>${escapeTelegramHtml(compact(message, 400))}</code>` +
    (referenceId ? `\n关联单号：<code>${escapeTelegramHtml(referenceId)}</code>` : '')
  )
}

function platformLabel(value: string): string {
  const labels: Record<string, string> = { BINANCE: '币安', OKX: '欧易' }
  return labels[value.toUpperCase()] ?? value
}

export function formatPlatformConfirmationFailedMessage(input: {
  platformOrderId: string
  paymentNo: string
  amount: string
  currency: string
  identityName?: string | null
  payeeIdentity?: string | null
  paymentMethod?: string | null
  reason: string
}): string {
  return (
    `<b>⚠️ C2C 确认付款失败</b>\n\n` +
    `姓名：<code>${escapeTelegramHtml(input.identityName || '未记录')}</code>\n` +
    `收款账号：<code>${escapeTelegramHtml(input.payeeIdentity || '未记录')}</code>\n` +
    (input.paymentMethod
      ? `收款方式：<code>${escapeTelegramHtml(paymentMethodLabel(input.paymentMethod))}</code>\n`
      : '') +
    `金额：<code>¥${escapeTelegramHtml(money(input.amount))}</code>\n` +
    `商家订单号：<code>${escapeTelegramHtml(input.platformOrderId)}</code>\n` +
    `失败原因：<code>${escapeTelegramHtml(compact(input.reason, 240))}</code>`
  )
}

export function formatBatchPlatformConfirmationResultMessage(input: {
  batchNo: string
  items: Array<{
    sourceBusinessNo: string
    amount: string
    currency: string
    success: boolean
    errorMessage: string | null
  }>
}): string {
  const success = input.items.filter((item) => item.success)
  const failed = input.items.filter((item) => !item.success)
  const failedLines = failed
    .map(
      (item) =>
        `\n失败订单：<code>${escapeTelegramHtml(item.sourceBusinessNo)}</code> ¥${escapeTelegramHtml(money(item.amount))}\n` +
        `原因：<code>${escapeTelegramHtml(compact(item.errorMessage || '未知错误', 240))}</code>`,
    )
    .join('')
  return (
    `<b>🔔 C2C 标记付款结果</b>\n` +
    `批次号：<code>${escapeTelegramHtml(input.batchNo)}</code>\n` +
    `总笔数：<code>${escapeTelegramHtml(input.items.length)}</code> 笔\n` +
    `成功：<code>${escapeTelegramHtml(success.length)}</code> 笔 / ` +
    `<code>¥${escapeTelegramHtml(money(sumMoney(success.map((item) => item.amount))))}</code>\n` +
    `失败：<code>${escapeTelegramHtml(failed.length)}</code> 笔 / ` +
    `<code>¥${escapeTelegramHtml(money(sumMoney(failed.map((item) => item.amount))))}</code>` +
    failedLines
  )
}

export function formatBatchPlatformConfirmationFailureMessage(input: {
  batchNo: string
  items: Array<{
    sourceBusinessNo: string
    amount: string
    success: boolean
    errorMessage: string | null
  }>
}): string {
  const failed = input.items.filter((item) => !item.success)
  const failedLines = failed
    .map(
      (item) =>
        `\n失败订单：<code>${escapeTelegramHtml(item.sourceBusinessNo)}</code> ¥${escapeTelegramHtml(money(item.amount))}\n` +
        `原因：<code>${escapeTelegramHtml(compact(item.errorMessage || '未知错误', 240))}</code>`,
    )
    .join('')
  return (
    `<b>⚠️ C2C 标记付款失败</b>\n` +
    `批次号：<code>${escapeTelegramHtml(input.batchNo)}</code>\n` +
    `失败：<code>${escapeTelegramHtml(failed.length)}</code> 笔 / ` +
    `<code>¥${escapeTelegramHtml(money(sumMoney(failed.map((item) => item.amount))))}</code>` +
    failedLines
  )
}

export function formatActionResultMessage(input: {
  title: string
  platformOrderId?: string | null
  paymentNo?: string | null
  status?: string | null
  reason?: string | null
}): string {
  const meta = input.status ? paymentStatusMeta(input.status) : null
  return (
    `${meta?.icon || '🔵'} <b>${escapeTelegramHtml(input.title)}</b>\n\n` +
    `<b>订单信息</b>` +
    (input.platformOrderId
      ? `\n商家订单号：<code>${escapeTelegramHtml(input.platformOrderId)}</code>`
      : '') +
    (input.paymentNo ? `\n系统订单号：<code>${escapeTelegramHtml(input.paymentNo)}</code>` : '') +
    (meta ? `\n状态：<b>${meta.icon} ${escapeTelegramHtml(meta.text)}</b>` : '') +
    (input.reason ? `\n原因：<code>${escapeTelegramHtml(compact(input.reason, 240))}</code>` : '')
  )
}
