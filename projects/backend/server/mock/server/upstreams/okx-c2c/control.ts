import type { OkxC2cMockOrder, OkxC2cSettings } from './types'
import { getOkxC2cState } from './state'

function object(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('参数必须是JSON对象')
  return value as Record<string, unknown>
}

function string(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空`)
  return value.trim()
}

export function validateSettingsPatch(value: unknown): Partial<OkxC2cSettings> {
  const input = object(value)
  const patch: Partial<OkxC2cSettings> = {}
  for (const field of ['authorization', 'cookie'] as const) if (field in input) patch[field] = string(input[field], field)
  for (const field of ['antiFraudReview', 'markOrderAsPaidFailure'] as const)
    if (field in input) {
      if (typeof input[field] !== 'boolean') throw new Error(`${field}必须是布尔值`)
      patch[field] = input[field]
    }
  return patch
}

export function validateOrder(value: unknown): OkxC2cMockOrder {
  const input = object(value)
  const now = Date.now()
  const publicTradingOrderId = string(input.publicTradingOrderId ?? input.publicOrderId, 'publicTradingOrderId')
  const receiptAccountId = string(input.receiptAccountId ?? '25990076', 'receiptAccountId')
  const accountName = string(input.accountName ?? input.realName ?? '测试用户', 'accountName')
  return {
    id: string(input.id ?? `okx-internal-${publicTradingOrderId}`, 'id'),
    publicTradingOrderId,
    side: input.side === 'sell' ? 'sell' : 'buy',
    orderStatus: input.orderStatus === 'completed' ? 'completed' : input.orderStatus === 'cancelled' ? 'cancelled' : 'new',
    orderProcessStatus: Number(input.orderProcessStatus ?? 2),
    paymentStatus: input.paymentStatus === 'confirmed' ? 'confirmed' : 'unpaid',
    baseAmount: string(input.baseAmount ?? '10.00', 'baseAmount'),
    baseCurrency: string(input.baseCurrency ?? 'usdt', 'baseCurrency').toLowerCase(),
    quoteAmount: string(input.quoteAmount ?? '70.00', 'quoteAmount'),
    quoteCurrency: string(input.quoteCurrency ?? 'cny', 'quoteCurrency').toLowerCase(),
    price: string(input.price ?? '7.00', 'price'),
    createdDate: Number(input.createdDate ?? now),
    modifyDate: Number(input.modifyDate ?? now),
    paymentDeadline: Number(input.paymentDeadline ?? now + 15 * 60_000),
    orderPaidDate: input.orderPaidDate == null ? null : Number(input.orderPaidDate),
    receiptAccountId,
    sellerReceiptAccount: {
      id: receiptAccountId,
      accountName,
      accountNo: string(input.accountNo ?? '13800138000', 'accountNo'),
      type: string(input.payType ?? 'aliPay', 'payType'),
      paymentDescription: string(input.payMethodName ?? '支付宝', 'payMethodName'),
      bankCode: string(input.bankCode ?? 'ALIPAY', 'bankCode'),
      bankName: typeof input.bankName === 'string' ? input.bankName : undefined,
    },
    detailUser: {
      realName: accountName,
      kycVerified: input.kycVerified !== false,
      nickName: typeof input.nickName === 'string' ? input.nickName : 'mock-user',
    },
  }
}

export function addOrder(value: unknown) {
  const order = validateOrder(value)
  getOkxC2cState().orders.insert(order)
  return order
}
