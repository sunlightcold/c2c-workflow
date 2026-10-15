import type { C2cMockAd } from './mock-ad'

/** Shared market used by the local workflow's three merchant accounts. */
export function createDemoAds(platform: 'BINANCE' | 'OKX'): C2cMockAd[] {
  const prefix = platform === 'BINANCE' ? '91' : '92'
  const base: C2cMockAd = {
    id: `${prefix}000000000000000001`,
    isOwn: true,
    isMerchant: true,
    periodMinutes: 15,
    externalMerchantId: platform === 'BINANCE' ? 'mock-hq-binance' : 'mock-hq-okx',
    asset: 'USDT',
    fiatCurrency: 'CNY',
    side: 'BUY',
    price: '7.05',
    status: 'ONLINE',
    availableAmount: '1000.00000000',
    minFiatAmount: '100',
    maxFiatAmount: '50000',
    paymentMethods: ['BANK', 'ALIPAY'],
    receiptIds: ['25990076'],
    traderNickname: platform === 'BINANCE' ? '总部币安测试商家' : '总部欧易测试商家',
  }
  const market = [
    ['11', 'BUY', '7.08', '同行 A'],
    ['12', 'BUY', '7.09', '同行 B'],
    ['13', 'BUY', '7.12', '同行 C'],
    ['21', 'SELL', '7.20', '参考卖家 A'],
    ['22', 'SELL', '7.21', '参考卖家 B'],
    ['23', 'SELL', '7.22', '参考卖家 C'],
  ] as const
  return [
    base,
    { ...base, id: `${prefix}000000000000000002`, status: 'OFFLINE', price: '7.00' },
    ...(platform === 'BINANCE'
      ? [
          {
            ...base,
            id: `${prefix}000000000000000003`,
            externalMerchantId: 'mock-agent-binance',
            traderNickname: '代理商币安测试商家',
            price: '7.03',
          },
        ]
      : []),
    ...market.map(([suffix, side, price, traderNickname]) => ({
      ...base,
      id: `${prefix}0000000000000000${suffix}`,
      isOwn: false,
      externalMerchantId: undefined,
      side,
      price,
      traderNickname,
    })),
  ]
}
