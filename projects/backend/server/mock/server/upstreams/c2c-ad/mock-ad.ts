export interface C2cMockAd {
  activeSeconds?: number
  id: string
  isOwn: boolean
  isMerchant: boolean
  periodMinutes: number
  asset: string
  fiatCurrency: string
  side: 'BUY' | 'SELL'
  price: string
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
  availableAmount: string
  minFiatAmount: string
  maxFiatAmount: string
  paymentMethods: string[]
  traderNickname: string
  externalMerchantId?: string
  receiptIds: string[]
  nextPlatformAdId?: string
}

function text(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field}不能为空`)
  return value.trim()
}

export function validateMockAd(value: unknown): C2cMockAd {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('广告必须是JSON对象')
  const input = value as Record<string, unknown>
  if (input.side !== 'BUY' && input.side !== 'SELL') throw new Error('广告方向无效')
  if (typeof input.isOwn !== 'boolean') throw new Error('isOwn必须是布尔值')
  if (typeof input.isMerchant !== 'boolean') throw new Error('isMerchant必须是布尔值')
  if (
    typeof input.periodMinutes !== 'number' ||
    !Number.isInteger(input.periodMinutes) ||
    input.periodMinutes < 1 ||
    input.periodMinutes > 1440
  )
    throw new Error('periodMinutes必须是1至1440的整数')
  if (!['ONLINE', 'OFFLINE', 'UNKNOWN'].includes(String(input.status)))
    throw new Error('广告状态无效')
  if (!Array.isArray(input.paymentMethods) || !Array.isArray(input.receiptIds))
    throw new Error('广告支付方式必须是数组')
  const amounts = Object.fromEntries(
    ['price', 'availableAmount', 'minFiatAmount', 'maxFiatAmount'].map((field) => {
      const amount = text(input[field], field)
      if (!/^\d+(\.\d+)?$/.test(amount)) throw new Error(`${field}必须是金额字符串`)
      return [field, amount]
    }),
  ) as Pick<C2cMockAd, 'price' | 'availableAmount' | 'minFiatAmount' | 'maxFiatAmount'>
  return {
    ...(typeof input.activeSeconds === 'number' ? { activeSeconds: input.activeSeconds } : {}),
    id: text(input.id, 'id'),
    isOwn: input.isOwn,
    isMerchant: input.isMerchant,
    periodMinutes: input.periodMinutes,
    asset: text(input.asset, 'asset').toUpperCase(),
    fiatCurrency: text(input.fiatCurrency, 'fiatCurrency').toUpperCase(),
    side: input.side,
    status: input.status as C2cMockAd['status'],
    ...amounts,
    paymentMethods: input.paymentMethods.map((method) => text(method, 'paymentMethods')),
    receiptIds: input.receiptIds.map((id) => text(id, 'receiptIds')),
    traderNickname: text(input.traderNickname, 'traderNickname'),
    ...(input.externalMerchantId
      ? { externalMerchantId: text(input.externalMerchantId, 'externalMerchantId') }
      : {}),
    ...(input.nextPlatformAdId
      ? { nextPlatformAdId: text(input.nextPlatformAdId, 'nextPlatformAdId') }
      : {}),
  }
}

export function compareMockAmount(left: string, right: string): number {
  const [leftWhole, leftFraction = ''] = left.split('.')
  const [rightWhole, rightFraction = ''] = right.split('.')
  const precision = Math.max(leftFraction.length, rightFraction.length)
  const leftValue = BigInt(leftWhole + leftFraction.padEnd(precision, '0'))
  const rightValue = BigInt(rightWhole + rightFraction.padEnd(precision, '0'))
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0
}
