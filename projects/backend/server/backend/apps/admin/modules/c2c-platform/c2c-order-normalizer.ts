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
  receiptAccountId?: unknown
  identifier?: unknown
  tradeMethodName?: unknown
  bankCode?: unknown
  type?: unknown
  payAccount?: unknown
  payBank?: unknown
  payee?: unknown
  accountNo?: unknown
  accountHolder?: unknown
  accountName?: unknown
  paymentDescription?: unknown
  fieldList?: PaymentField[]
  fields?: PaymentField[]
}

interface PaymentDetails {
  identityName: string
  kycStatus: string
  payeeIdentity: string
  payeeName: string
  paymentMethod: string
  platformPaymentMethodId: string
  verified: boolean
}

interface BinanceTaker {
  realName?: unknown
  userKycVo?: {
    firstName?: unknown
    middleName?: unknown
    lastName?: unknown
    kycStatus?: unknown
  }
}

interface OkxDetailUser {
  realName?: unknown
  kycVerified?: unknown
  sellerSelectedReceiptAccount?: unknown
  sellerReceiptAccount?: unknown
  sellerAllReceiptAccountList?: unknown
}

const holderFields = new Set([
  'payee',
  'name',
  'account_name',
  'holder_name',
  'account_holder',
  'beneficiary_name',
])
const accountFields = new Set([
  'pay_account',
  'account_no',
  'account_number',
  'bank_account',
  'bank_card_number',
  'card_number',
  'alipay_account',
  'wechat_account',
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
  const methodId = text(input.selectedPayId)
  const selected = methods.find((method) => text(method.id) === methodId)
  const fields = [...(selected?.fieldList ?? []), ...(selected?.fields ?? [])]
  const { payeeIdentity, payeeName } = binanceRecipient(input, selected, fields)
  const { identityName, kycStatus } = binanceIdentity(input)
  return {
    platformPaymentMethodId: methodId,
    paymentMethod: firstText(
      input.payType,
      selected?.identifier,
      selected?.tradeMethodName,
    ).toUpperCase(),
    payeeIdentity,
    payeeName,
    identityName,
    kycStatus,
    verified: !kycStatus || kycStatus === 'PASS',
  }
}

function binanceRecipient(
  input: Record<string, unknown>,
  selected: PaymentMethod | undefined,
  fields: PaymentField[],
): Pick<PaymentDetails, 'payeeIdentity' | 'payeeName'> {
  return {
    payeeName: firstText(
      input.payee,
      selected?.payee,
      selected?.accountHolder,
      findField(fields, holderFields),
    ),
    payeeIdentity: firstText(
      input.payAccount,
      selected?.payAccount,
      selected?.accountNo,
      findField(fields, accountFields),
    ),
  }
}

function binanceIdentity(
  input: Record<string, unknown>,
): Pick<PaymentDetails, 'identityName' | 'kycStatus'> {
  const taker = input.taker as BinanceTaker | undefined
  const identityName = input.isSellerCompanyAccount
    ? text(input.sellerCompanyAccountName)
    : firstText(taker?.realName, buildStructuredName(taker?.userKycVo), input.sellerName)
  return { identityName, kycStatus: text(taker?.userKycVo?.kycStatus) }
}

export function normalizeOkxSummary(input: Record<string, unknown>): C2cBuyOrderSummary {
  if (text(input.side).toLowerCase() !== 'buy') throw new Error('欧易 C2C 返回了非 BUY 订单')
  return {
    platformOrderId: requiredText(input.id, '欧易订单 ID'),
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
  const summary = normalizeOkxSummary({ ...input, id: expectedOrderId })
  const details = normalizeOkxPaymentDetails(input)
  return buildDetail(summary, summary.assetAmount, details, input)
}

function normalizeOkxPaymentDetails(input: Record<string, unknown>): PaymentDetails {
  const orderDetailUser = input.orderDetailUserVo as OkxDetailUser | undefined
  const detailUser = input.detailUser as OkxDetailUser | undefined
  const { fallbackAccount, methodId, selected } = okxReceiptAccount(
    input,
    orderDetailUser,
    detailUser,
  )
  const kycVerified = firstBoolean(orderDetailUser?.kycVerified, detailUser?.kycVerified)
  const payeeIdentity = text(selected?.accountNo)
  const payeeName = text(selected?.accountName)
  const identityName = firstText(
    orderDetailUser?.realName,
    detailUser?.realName,
    input.counterPartyName,
  )
  return {
    platformPaymentMethodId: methodId,
    paymentMethod: firstText(
      fallbackAccount?.type,
      fallbackAccount?.bankCode,
      input.receiptAccountType,
      fallbackAccount?.paymentDescription,
    ).toUpperCase(),
    payeeIdentity: payeeIdentity || text(fallbackAccount?.accountNo),
    payeeName: payeeName || text(fallbackAccount?.accountName),
    identityName,
    kycStatus: kycVerified === undefined ? '' : kycVerified ? 'PASS' : 'FAIL',
    verified: kycVerified !== false,
  }
}

function okxReceiptAccount(
  input: Record<string, unknown>,
  orderDetailUser: OkxDetailUser | undefined,
  detailUser: OkxDetailUser | undefined,
): {
  fallbackAccount: PaymentMethod | undefined
  methodId: string
  selected: PaymentMethod | undefined
} {
  const selectedId = firstText(input.receiptAccountId, input.selectedPayId)
  const directSelected = firstObject(
    orderDetailUser?.sellerSelectedReceiptAccount,
    detailUser?.sellerSelectedReceiptAccount,
    input.sellerReceiptAccount,
    orderDetailUser?.sellerReceiptAccount,
    input.receiptAccount,
  )
  const accounts = firstArray(
    orderDetailUser?.sellerAllReceiptAccountList,
    detailUser?.sellerAllReceiptAccountList,
    input.sellerAllReceiptAccountList,
  )
  const selected = directSelected ?? findReceiptAccount(accounts, selectedId)
  const fallbackAccount = selected ?? accounts[0]
  return {
    selected,
    fallbackAccount,
    methodId: firstText(
      selectedId,
      fallbackAccount?.id,
      fallbackAccount?.receiptAccountId,
      fallbackAccount?.accountNo,
    ),
  }
}

function findReceiptAccount(
  accounts: PaymentMethod[],
  selectedId: string,
): PaymentMethod | undefined {
  return accounts.find((account) =>
    [account.id, account.receiptAccountId].map(text).includes(selectedId),
  )
}

function buildDetail(
  summary: C2cBuyOrderSummary,
  assetAmount: string | null,
  details: PaymentDetails,
  input: Record<string, unknown>,
): C2cBuyOrderDetail {
  const unpayableReason = paymentBlockReason(summary.status, details)
  return {
    ...summary,
    assetAmount,
    platformPaymentMethodId: details.platformPaymentMethodId,
    paymentMethod: details.paymentMethod,
    payeeIdentity: details.payeeIdentity,
    payeeName: details.payeeName,
    identityName: details.identityName,
    payable: !unpayableReason,
    ...(details.kycStatus ? { kycStatus: details.kycStatus } : {}),
    ...(unpayableReason ? { unpayableReason } : {}),
    ...optionalDateFields(input),
  }
}

function paymentBlockReason(
  status: C2cBuyOrderStatus,
  details: PaymentDetails,
): string | undefined {
  if (status !== C2cBuyOrderStatus.PENDING_PAYMENT) return '订单不是等待付款状态'
  if (!details.verified) return '卖方 KYC 未通过'
  if (!details.platformPaymentMethodId) return '未找到订单选中的收款方式'
  if (!details.identityName) return '实名信息为空'
  if (!details.payeeName) return '收款方式持有人姓名为空'
  if (!details.payeeIdentity) return '收款账号为空'
  return undefined
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
  const status = text(input.orderStatus ?? input.status).toLowerCase()
  const payment = text(input.paymentStatus).toLowerCase()
  const process = text(input.orderProcessStatus)
  if (status === 'completed' || process === '4') return C2cBuyOrderStatus.COMPLETED
  if (status === 'cancelled' || process === '3') return C2cBuyOrderStatus.CANCELLED
  if (status === 'expired') return C2cBuyOrderStatus.EXPIRED
  if (status.includes('appeal') || status.includes('dispute')) return C2cBuyOrderStatus.DISPUTED
  if (payment === 'paid' || payment === 'confirmed') return C2cBuyOrderStatus.PAID
  if (
    ['new', 'pending', 'processing', 'open'].includes(status) ||
    process === '2' ||
    (!status && (!payment || payment === 'unpaid'))
  )
    return C2cBuyOrderStatus.PENDING_PAYMENT
  // The OKX pending-order endpoint has returned additional non-terminal status
  // labels over time. Its payment state is the reliable discriminator for an
  // unpaid order, matching the pfa-pay adapter's compatibility behavior.
  if (!payment || payment === 'unpaid') return C2cBuyOrderStatus.PENDING_PAYMENT
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

function buildStructuredName(value: Record<string, unknown> | undefined): string {
  if (!value) return ''
  return [value.firstName, value.middleName, value.lastName].map(text).filter(Boolean).join(' ')
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const result = text(value)
    if (result) return result
  }
  return ''
}

function firstObject(...values: unknown[]): PaymentMethod | undefined {
  return values.find(
    (value): value is PaymentMethod =>
      Boolean(value) && typeof value === 'object' && !Array.isArray(value),
  )
}

function firstArray(...values: unknown[]): PaymentMethod[] {
  const value = values.find(Array.isArray)
  return value ? (value as PaymentMethod[]) : []
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === 'boolean')
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
