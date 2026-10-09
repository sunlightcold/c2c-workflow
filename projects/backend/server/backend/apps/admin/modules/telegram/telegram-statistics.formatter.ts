import {
  addDecimalStrings,
  decimal,
  formatDecimal,
  formatTrimmedDecimal,
} from '@/common/utils/decimal'
import { C2cBuyOrderStatus, type C2cReportOrder } from '../c2c-platform'
import { escapeTelegramHtml } from './telegram-query.formatter'

export interface LocalReconciliationOrder {
  platformOrderId: string
  assetAmount: string
  fiatAmount: string
  paymentStatus: string | null
}

interface Summary {
  count: number
  assetAmount: string
  fiatAmount: string
}

const platformLabels: Record<C2cBuyOrderStatus, string> = {
  COMPLETED: '已完成',
  PAID: '已付款待放币',
  PENDING_PAYMENT: '待付款',
  CANCELLED: '已取消',
  EXPIRED: '已过期',
  DISPUTED: '申诉中',
  UNKNOWN: '未知状态',
}

const differenceLabels = {
  awaitingRelease: '系统已付款，平台仍待放币',
  unpaidCompleted: '系统未完成付款，平台已完成',
  unpaidPaid: '平台已付款，系统未完成付款',
  paidTerminated: '平台已取消/过期，系统已付款',
  platformOnly: '平台订单未同步到系统',
  localOnly: '系统订单未在平台查到',
  paidOther: '系统已付款，平台状态需核实',
  unknown: '平台状态无法识别',
  amountMismatch: '双方订单金额或数量不一致',
}
type Difference = keyof typeof differenceLabels

export function formatProviderReconciliation(
  providerOrders: C2cReportOrder[],
  localOrders: LocalReconciliationOrder[],
) {
  const statusSummary = new Map<string, Summary>()
  const differences = new Map<Difference, Summary>()
  const details: string[] = []
  const localById = new Map(localOrders.map((order) => [order.platformOrderId, order]))
  const providerIds = new Set(providerOrders.map((order) => order.platformOrderId))
  const total = emptySummary()
  for (const order of providerOrders) {
    accumulate(total, order)
    const status = statusSummary.get(order.status) ?? emptySummary()
    accumulate(status, order)
    statusSummary.set(order.status, status)
    const local = localById.get(order.platformOrderId)
    const difference = classify(order, local)
    if (!difference) continue
    const summary = differences.get(difference) ?? emptySummary()
    accumulate(summary, order)
    differences.set(difference, summary)
    if (difference !== 'awaitingRelease') {
      details.push(detailLine(order, differenceDescription(order, local, difference)))
    }
  }
  for (const order of localOrders) {
    if (providerIds.has(order.platformOrderId)) continue
    const summary = differences.get('localOnly') ?? emptySummary()
    accumulate(summary, order)
    differences.set('localOnly', summary)
    details.push(detailLine(order, differenceLabels.localOnly))
  }
  const platformLines = Object.entries(platformLabels)
    .filter(([status]) => status !== 'UNKNOWN' || statusSummary.has(status))
    .map(
      ([status, label]) => `${label}：${summaryLine(statusSummary.get(status) ?? emptySummary())}`,
    )
  const differenceLines = Object.entries(differenceLabels)
    .filter(
      ([key]) =>
        [
          'awaitingRelease',
          'unpaidCompleted',
          'paidTerminated',
          'platformOnly',
          'localOnly',
        ].includes(key) || differences.has(key as Difference),
    )
    .map(
      ([key, label]) =>
        `${label}：${summaryLine(differences.get(key as Difference) ?? emptySummary())}`,
    )
  const waiting = differences.get('awaitingRelease')?.count ?? 0
  const result = details.length
    ? `核对结果：${details.length} 笔需核实${waiting ? `，${waiting} 笔待放币` : ''}`
    : waiting
      ? `核对结果：${waiting} 笔待放币，无其他差异`
      : '核对结果：系统与商家平台数据一致'
  return {
    text:
      `<b>商家平台统计</b>\n${platformLines.join('\n')}\n汇总：${summaryLine(total)}\n\n` +
      `<b>对账差异</b>\n${differences.size ? `${differenceLines.join('\n')}\n\n` : ''}${result}`,
    details,
  }
}

function classify(order: C2cReportOrder, local?: LocalReconciliationOrder): Difference | undefined {
  if (!local) return 'platformOnly'
  if (
    !decimal(order.fiatAmount).eq(local.fiatAmount) ||
    !decimal(order.assetAmount).eq(local.assetAmount)
  ) {
    return 'amountMismatch'
  }
  if (order.status === C2cBuyOrderStatus.UNKNOWN) return 'unknown'
  if (['SUCCESS', 'COMPLETED', 'PLATFORM_CONFIRM_PENDING'].includes(local.paymentStatus ?? '')) {
    if (order.status === C2cBuyOrderStatus.COMPLETED) return undefined
    if (order.status === C2cBuyOrderStatus.PAID) return 'awaitingRelease'
    if ([C2cBuyOrderStatus.CANCELLED, C2cBuyOrderStatus.EXPIRED].includes(order.status))
      return 'paidTerminated'
    return 'paidOther'
  }
  if (order.status === C2cBuyOrderStatus.COMPLETED) return 'unpaidCompleted'
  if (order.status === C2cBuyOrderStatus.PAID) return 'unpaidPaid'
  return undefined
}

function differenceDescription(
  order: C2cReportOrder,
  local: LocalReconciliationOrder | undefined,
  difference: Difference,
) {
  if (difference === 'platformOnly') return differenceLabels.platformOnly
  if (difference === 'amountMismatch' && local) {
    return `数量/金额不一致，系统 ${formatTrimmedDecimal(local.assetAmount, 18)} USDT / ¥${formatDecimal(local.fiatAmount, 2)}`
  }
  const labels: Record<string, string> = {
    SUCCESS: '支付成功',
    COMPLETED: '支付成功',
    PLATFORM_CONFIRM_PENDING: '已付款待平台确认',
    FAILED: '付款失败',
    CANCELLED: '已作废',
    FUND_EXCEPTION: '资金异常',
    PENDING_CONFIG: '待配置',
    CREATED: '待支付',
    READY: '待支付',
    SUBMITTING: '支付中',
    PROCESSING: '支付中',
    UNKNOWN: '支付结果未知',
  }
  const system = local?.paymentStatus
    ? (labels[local.paymentStatus] ?? local.paymentStatus)
    : '无支付订单'
  return `平台${platformLabels[order.status]}，系统${system}`
}

function detailLine(order: LocalReconciliationOrder | C2cReportOrder, description: string) {
  return (
    `<code>${escapeTelegramHtml(order.platformOrderId)}</code>｜${escapeTelegramHtml(description)}｜` +
    `${formatTrimmedDecimal(order.assetAmount, 18)} USDT｜¥${formatDecimal(order.fiatAmount, 2)}`
  )
}

function emptySummary(): Summary {
  return { count: 0, assetAmount: '0', fiatAmount: '0' }
}

function accumulate(summary: Summary, order: { assetAmount: string; fiatAmount: string }) {
  summary.count += 1
  summary.assetAmount = addDecimalStrings(summary.assetAmount, order.assetAmount)
  summary.fiatAmount = addDecimalStrings(summary.fiatAmount, order.fiatAmount)
}

function summaryLine(summary: Summary) {
  return `${summary.count} 笔 / ${formatTrimmedDecimal(summary.assetAmount, 18)} USDT / ¥${formatDecimal(summary.fiatAmount, 2)}`
}

export function splitStatisticsMessages(
  summary: string,
  lines: string[],
  footer: string,
): string[] {
  const messages: string[] = []
  let text = summary
  let heading = '\n\n<b>需核实订单</b>'
  for (const line of lines) {
    if (text.length + heading.length + line.length + 1 > 3500) {
      messages.push(text)
      text = '<b>需核实订单（续）</b>'
      heading = ''
    }
    text += `${heading}\n${line}`
    heading = ''
  }
  if (text.length + footer.length + 2 > 3500) {
    messages.push(text)
    text = footer
  } else {
    text += `\n\n${footer}`
  }
  messages.push(text)
  return messages
}
