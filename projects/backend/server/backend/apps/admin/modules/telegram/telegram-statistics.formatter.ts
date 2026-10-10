import {
  addDecimalStrings,
  decimal,
  formatDecimal,
  formatTrimmedDecimal,
} from '@/common/utils/decimal'
import { C2cBuyOrderStatus, type C2cReportOrder } from '../c2c-platform'

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
  }
  for (const order of localOrders) {
    if (providerIds.has(order.platformOrderId)) continue
    const summary = differences.get('localOnly') ?? emptySummary()
    accumulate(summary, order)
    differences.set('localOnly', summary)
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
  const verificationCount = [...differences.entries()]
    .filter(([key]) => key !== 'awaitingRelease')
    .reduce((count, [, summary]) => count + summary.count, 0)
  const result = verificationCount
    ? `核对结果：${verificationCount} 笔需核实${waiting ? `，${waiting} 笔待放币` : ''}`
    : waiting
      ? `核对结果：${waiting} 笔待放币，无其他差异`
      : '核对结果：系统与商家平台数据一致'
  return {
    text:
      `<b>商家平台统计</b>\n${platformLines.join('\n')}\n汇总：${summaryLine(total)}\n\n` +
      `<b>对账差异</b>\n${differences.size ? `${differenceLines.join('\n')}\n\n` : ''}${result}`,
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
