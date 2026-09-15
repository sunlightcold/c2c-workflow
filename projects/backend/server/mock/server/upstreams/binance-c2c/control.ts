import type { BinanceC2cMockOrder, BinanceC2cPayMethod, BinanceC2cSettings } from './types'
import { getBinanceC2cState } from './state'

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是JSON对象')
  return value as Record<string, unknown>
}

function string(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空`)
  return value.trim()
}

export function validateSettingsPatch(value: unknown): Partial<BinanceC2cSettings> {
  const input = object(value)
  const patch: Partial<BinanceC2cSettings> = {}
  if ('verifySignature' in input) {
    if (typeof input.verifySignature !== 'boolean') throw new Error('verifySignature必须是布尔值')
    patch.verifySignature = input.verifySignature
  }
  if ('markOrderAsPaidFailure' in input) {
    if (typeof input.markOrderAsPaidFailure !== 'boolean') throw new Error('markOrderAsPaidFailure必须是布尔值')
    patch.markOrderAsPaidFailure = input.markOrderAsPaidFailure
  }
  for (const field of ['apiKey', 'secretKey', 'clientType'] as const)
    if (field in input) patch[field] = string(input[field], field)
  return patch
}

export function validateOrder(value: unknown): BinanceC2cMockOrder {
  const input = object(value)
  const paymentValues = Array.isArray(input.payMethods) ? input.payMethods : [input.paymentMethod ?? {}]
  const payments = paymentValues.map((value) => object(value))
  if (!payments.length) throw new Error('payMethods不能为空')
  const now = new Date().toISOString()
  const paymentDeadline = new Date(Date.now() + 15 * 60_000).toISOString()
  const orderNumber = string(input.orderNumber, 'orderNumber')
  const selectedPayId = string(input.selectedPayId ?? payments[0].id ?? '1', 'selectedPayId')
  const payMethods = payments.map((payment) => ({
    id: string(payment.id ?? '1', 'paymentMethod.id'),
    identifier: string(payment.identifier ?? 'BANK', 'paymentMethod.identifier'),
    tradeMethodName: string(payment.tradeMethodName ?? '银行卡', 'paymentMethod.tradeMethodName'),
    payAccount: string(payment.payAccount ?? '13800000000', 'paymentMethod.payAccount'),
    payBank: typeof payment.payBank === 'string' ? payment.payBank : undefined,
    fieldList: (Array.isArray(payment.fieldList) ? payment.fieldList : []) as BinanceC2cPayMethod['fieldList'],
  }))
  const order: BinanceC2cMockOrder = {
    id: orderNumber,
    externalMerchantId:
      typeof input.externalMerchantId === 'string'
        ? string(input.externalMerchantId, 'externalMerchantId')
        : undefined,
    orderNumber,
    orderStatus: Number(input.orderStatus ?? 1),
    totalPrice: string(input.totalPrice ?? '10.00', 'totalPrice'),
    amount: string(input.amount ?? '10.00', 'amount'),
    asset: string(input.asset ?? 'USDT', 'asset'),
    fiat: string(input.fiat ?? 'CNY', 'fiat'),
    fiatUnit: string(input.fiatUnit ?? input.fiat ?? 'CNY', 'fiatUnit'),
    tradeType: input.tradeType === 'SELL' ? 'SELL' : 'BUY',
    createTime: string(input.createTime ?? now, 'createTime'),
    updateTime: string(input.updateTime ?? now, 'updateTime'),
    paymentDeadline: string(input.paymentDeadline ?? paymentDeadline, 'paymentDeadline'),
    selectedPayId,
    payMethods,
    complaintReasons: Array.isArray(input.complaintReasons)
      ? input.complaintReasons
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
          .map((item) => ({
            reasonCode: Number(item.reasonCode),
            reasonDesc: string(item.reasonDesc, 'complaintReasons.reasonDesc'),
          }))
          .filter((item) => Number.isSafeInteger(item.reasonCode))
      : undefined,
    taker: {
      realName: typeof input.realName === 'string' ? input.realName : '测试用户',
      userKycVo: { kycStatus: typeof input.kycStatus === 'string' ? input.kycStatus : 'PASS' },
    },
  }
  if (input.isSellerCompanyAccount === true) {
    order.isSellerCompanyAccount = true
    order.sellerCompanyAccountName = string(input.sellerCompanyAccountName, 'sellerCompanyAccountName')
  }
  return order
}

export function addOrder(value: unknown) {
  const order = validateOrder(value)
  getBinanceC2cState().orders.insert(order)
  return order
}
