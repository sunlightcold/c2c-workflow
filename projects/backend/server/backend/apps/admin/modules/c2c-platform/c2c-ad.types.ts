export type C2cAdSide = 'BUY' | 'SELL'

export interface C2cAd {
  platformAdId: string
  asset: string
  fiatCurrency: string
  side: C2cAdSide
  price: string
  status: 'ONLINE' | 'OFFLINE' | 'UNKNOWN'
  paymentMethods: string[]
  availableAmount: string
  minFiatAmount: string
  maxFiatAmount: string
}

export interface C2cMarketQuote {
  activeSeconds?: number | null
  platformAdId: string
  traderNickname: string
  asset: string
  fiatCurrency: string
  side: C2cAdSide
  price: string
  minFiatAmount: string
  maxFiatAmount: string
  paymentMethods: string[]
}

export interface C2cAdMarketQuery {
  asset: 'USDT'
  fiatCurrency: string
  side: C2cAdSide
  amount: string
  paymentMethods: string[]
  merchantOnly: boolean
  periodMinutes: number | null
  limit: number
}

export interface C2cAdMarketSnapshot {
  quotes: C2cMarketQuote[]
  fetchedAt: string
  window: { page: number; rows: number }
}

export interface C2cAdPriceUpdateResult {
  platformAdId: string
}
