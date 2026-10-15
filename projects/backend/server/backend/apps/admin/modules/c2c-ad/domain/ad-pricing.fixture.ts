import type { AdPricingInput, UnifiedAdRule } from './ad-pricing.types'
import type { C2cMarketQuote } from '../../c2c-platform/c2c-ad.types'

export const fixedRule: UnifiedAdRule = {
  mode: 'FIXED',
  step: '0.01',
  fixedLimit: '7.10',
  competitorAmount: '1000',
  competitorPaymentMethods: ['BANK'],
  competitorPeriod: null,
  merchantOnly: true,
  followNickname: null,
  blockedNicknames: [],
  profitPerUsdt: null,
  feePercent: null,
  referencePaymentMethods: ['BANK'],
  referencePosition: 1,
  intervalSeconds: 30,
}

export const quote = (
  id: string,
  price: string,
  overrides: Partial<C2cMarketQuote> = {},
): C2cMarketQuote => ({
  platformAdId: id,
  traderNickname: id,
  asset: 'USDT',
  fiatCurrency: 'CNY',
  side: 'BUY',
  price,
  minFiatAmount: '100',
  maxFiatAmount: '10000',
  paymentMethods: ['BANK'],
  ...overrides,
})

export function pricingInput(overrides: Partial<UnifiedAdRule> = {}): AdPricingInput {
  const rule = { ...fixedRule, ...overrides }
  const query = {
    asset: 'USDT' as const,
    fiatCurrency: 'CNY',
    side: 'BUY' as const,
    amount: '1000',
    paymentMethods: ['BANK'],
    merchantOnly: true,
    periodMinutes: null,
    limit: 20,
  }
  return {
    rule,
    ownAdIds: ['own'],
    ownAd: {
      platformAdId: 'own',
      asset: 'USDT',
      fiatCurrency: 'CNY',
      side: 'BUY',
      price: '7.05',
      status: 'ONLINE',
      paymentMethods: ['BANK'],
      availableAmount: '10000',
      minFiatAmount: '100',
      maxFiatAmount: '10000',
    },
    competitorQuery: query,
    referenceQuery: rule.mode === 'DYNAMIC' ? { ...query, side: 'SELL', limit: 10 } : null,
    competitorSnapshot: {
      quotes: [quote('A', '7.08'), quote('B', '7.09'), quote('C', '7.12')],
      fetchedAt: new Date().toISOString(),
      window: { page: 1, rows: 20 },
    },
    referenceSnapshot:
      rule.mode === 'DYNAMIC'
        ? {
            quotes: [quote('seller', '7.20', { side: 'SELL' })],
            fetchedAt: new Date().toISOString(),
            window: { page: 1, rows: 10 },
          }
        : null,
  }
}
