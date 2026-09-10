import {
  C2cBuyOrderStatus,
  type C2cBuyOrderDetail,
  type C2cBuyOrderSummary,
} from './c2c-platform.types'

interface PaymentField {
  fieldContentType?: unknown
  fieldName?: unknown
  fieldTitleKey?: unknown
  fieldValue?: unknown
}

interface PaymentMethod {
  id?: unknown
  identifier?: unknown
  tradeMethodName?: unknown
  payAccount?: unknown
  payee?: unknown
  accountNo?: unknown
  accountHolder?: unknown
  fieldList?: PaymentField[]
  fields?: PaymentField[]
}

interface PaymentDetails {
  identityName: string
  payeeIdentity: string
  payeeName: string
  paymentMethod: string
  platformPaymentMethodId: string
  verified: boolean
}

const holderFields = new Set(['payee', 'name', 'account_name', 'holder_name', 'account_holder'])
const accountFields = new Set([
  'pay_account',
  'account_no',
  'account_number',
  'alipay_account',
  'phone',
  'mobile',
])

export function normalizeBinanceSummary(input: Record<string, unknown>): C2cBuyOrderSummary {
  if (text(input.tradeType).toUpperCase() !== 'BUY') throw new Error('币安 C2C 返回了非 BUY 订单')
  return {
    platformOrderId: requiredText(input.orderNumber, '币安订单号'),
    side: 'BUY',
    status: normalizeNumericStatus(input.orderStatus),
    asset: requiredText(input.asset, '币安数字资产').toUpperCase(),
    assetAmount: requiredAmount(input.amount, '币安数字资产数量'),
    fiatCurrency: requiredText(input.fiat ?? input.fiatUnit, '币安法币').toUpperCase(),
    fiatAmount: requiredAmount(input.totalPrice, '币安法币金额'),
    createdAt: requiredDate(input.createTime, '币安订单创建时间'),
  }
}

export function normalizeBinanceDetail(
  input: Record<string, unknown>,
  expectedOrderId: string,
): C2cBuyOrderDetail {
  const summary = normalizeBinanceSummary({
    ...input,
    fiat: input.fiatUnit,
    amount: input.amount ?? '0',
  })
  if (summary.platformOrderId !== expectedOrderId) throw new Error('币安订单详情返回的订单号不匹配')
  const details = normalizeBinancePaymentDetails(input)
  return buildDetail(summary, optionalAmount(input.amount), details, input)
}

function normalizeBinancePaymentDetails(input: Record<string, unknown>): PaymentDetails {
  const methods = paymentMethods(input.payMethods)
  const methodId = requiredText(input.selectedPayId, '币安平台付款方式 ID')
  const selected = methods.find((method) => text(method.id) === methodId)
  if (!selected) throw new Error('币安订单未返回选中的付款方式')
  const fields = [...(selected.fieldList ?? []), ...(selected.fields ?? [])]
  const payeeName =
    text(input.payee) ||
    text(selected.payee ?? selected.accountHolder) ||
    findField(fields, holderFields)
  const payeeIdentity =
    text(input.payAccount) ||
    text(selected.payAccount ?? selected.accountNo) ||
    findField(fields, accountFields)
  const identityName = input.isSellerCompanyAccount
    ? text(input.sellerCompanyAccountName)
    : text((input.taker as { realName?: unknown } | undefined)?.realName) || text(input.sellerName)
  return {
    platformPaymentMethodId: methodId,
    paymentMethod: text(
      input.payType ?? selected.identifier ?? selected.tradeMethodName,
    ).toUpperCase(),
    payeeIdentity,
    payeeName,
    identityName,
    verified: true,
  }
}

export function normalizeOkxSummary(input: Record<string, unknown>): C2cBuyOrderSummary {
  if (text(input.side ?? 'buy').toLowerCase() !== 'buy')
    throw new Error('欧易 C2C 返回了非 BUY 订单')
  return {
    platformOrderId: requiredText(input.id ?? input.publicOrderId ?? input.orderId, '欧易订单 ID'),
    side: 'BUY',
    status: normalizeOkxStatus(input),
    asset: requiredText(
      input.baseCurrency ?? input.baseAsset ?? input.asset,
      '欧易数字资产',
    ).toUpperCase(),
    assetAmount: requiredAmount(input.baseAmount ?? input.amount, '欧易数字资产数量'),
    fiatCurrency: requiredText(
      input.quoteCurrency ?? input.fiatCurrency ?? input.fiat,
      '欧易法币',
    ).toUpperCase(),
    fiatAmount: requiredAmount(input.quoteAmount ?? input.totalPrice, '欧易法币金额'),
    createdAt: requiredDate(input.createdDate ?? input.createTime, '欧易订单创建时间'),
  }
}

export function normalizeOkxDetail(
  input: Record<string, unknown>,
  expectedOrderId: string,
): C2cBuyOrderDetail {
  const summary = normalizeOkxSummary(input)
  if (summary.platformOrderId !== expectedOrderId) throw new Error('欧易订单详情返回的订单号不匹配')
  const details = normalizeOkxPaymentDetails(input)
  return buildDetail(summary, summary.assetAmount, details, input)
}

function normalizeOkxPaymentDetails(input: Record<string, unknown>): PaymentDetails {
  const selected = (input.sellerReceiptAccount ??
    (input.orderDetailUserVo as { sellerReceiptAccount?: unknown } | undefined)
      ?.sellerReceiptAccount ??
    input.receiptAccount) as Record<string, unknown> | undefined
  const methodId = requiredText(input.receiptAccountId ?? selected?.id, '欧易平台付款方式 ID')
  const detailUser = (input.orderDetailUserVo ?? input.detailUser) as
    | { realName?: unknown; kycVerified?: unknown }
    | undefined
  const payeeIdentity = text(selected?.accountNo)
  const payeeName = text(selected?.accountName)
  const identityName = text(detailUser?.realName ?? input.counterPartyName)
  return {
    platformPaymentMethodId: methodId,
    paymentMethod: text(
      selected?.bankCode ?? selected?.type ?? input.receiptAccountType,
    ).toUpperCase(),
    payeeIdentity,
    payeeName,
    identityName,
    verified: detailUser?.kycVerified !== false,
  }
}

function buildDetail(
  summary: C2cBuyOrderSummary,
  assetAmount: string | null,
  details: PaymentDetails,
  input: Record<string, unknown>,
): C2cBuyOrderDetail {
  return {
    ...summary,
    assetAmount,
    platformPaymentMethodId: details.platformPaymentMethodId,
    paymentMethod: details.paymentMethod,
    payeeIdentity: details.payeeIdentity,
    payeeName: details.payeeName,
    identityName: details.identityName,
    payable:
      summary.status === C2cBuyOrderStatus.PENDING_PAYMENT &&
      details.verified &&
      Boolean(
        details.payeeIdentity &&
          details.payeeName &&
          details.identityName &&
          details.platformPaymentMethodId,
      ),
    ...optionalDateFields(input),
  }
}

function normalizeNumericStatus(value: unknown): C2cBuyOrderStatus {
  const statuses: Record<string, C2cBuyOrderStatus> = {
    '1': C2cBuyOrderStatus.PENDING_PAYMENT,
    '2': C2cBuyOrderStatus.PAID,
    '3': C2cBuyOrderStatus.DISPUTED,
    '4': C2cBuyOrderStatus.COMPLETED,
    '6': C2cBuyOrderStatus.CANCELLED,
    '7': C2cBuyOrderStatus.EXPIRED,
  }
  return statuses[text(value)] ?? C2cBuyOrderStatus.UNKNOWN
}

function normalizeOkxStatus(input: Record<string, unknown>): C2cBuyOrderStatus {
  const status = text(input.orderStatus).toLowerCase()
  const payment = text(input.paymentStatus).toLowerCase()
  const process = text(input.orderProcessStatus)
  if (status === 'completed' || process === '4') return C2cBuyOrderStatus.COMPLETED
  if (status === 'cancelled' || process === '3') return C2cBuyOrderStatus.CANCELLED
  if (status === 'expired') return C2cBuyOrderStatus.EXPIRED
  if (payment === 'confirmed') return C2cBuyOrderStatus.PAID
  if (status === 'new' && payment === 'unpaid') return C2cBuyOrderStatus.PENDING_PAYMENT
  return C2cBuyOrderStatus.UNKNOWN
}

function paymentMethods(value: unknown): PaymentMethod[] {
  return Array.isArray(value) ? (value as PaymentMethod[]) : []
}

function findField(fields: PaymentField[], accepted: Set<string>): string {
  const field = fields.find((candidate) =>
    [candidate.fieldContentType, candidate.fieldName, candidate.fieldTitleKey]
      .map(fieldKey)
      .some((key) => accepted.has(key)),
  )
  return text(field?.fieldValue)
}

function fieldKey(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function optionalDateFields(input: Record<string, unknown>): {
  paymentDeadline?: string
  updatedAt?: string
} {
  const deadline = optionalDate(
    input.paymentDeadline ?? input.paymentExpireTime ?? input.expireTime ?? input.payEndTime,
  )
  const updatedAt = optionalDate(input.updateTime ?? input.modifyDate)
  return {
    ...(deadline ? { paymentDeadline: deadline } : {}),
    ...(updatedAt ? { updatedAt } : {}),
  }
}

function requiredDate(value: unknown, field: string): string {
  const result = optionalDate(value)
  if (!result) throw new Error(`${field}无效`)
  return result
}

function optionalDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const numeric = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value
  const date = new Date(numeric as string | number)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function requiredAmount(value: unknown, field: string): string {
  const result = text(value)
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result)) throw new Error(`${field}无效`)
  return result
}

function optionalAmount(value: unknown): string | null {
  const result = text(value)
  return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(result) ? result : null
}

function requiredText(value: unknown, field: string): string {
  const result = text(value)
  if (!result) throw new Error(`${field}为空`)
  return result
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}
