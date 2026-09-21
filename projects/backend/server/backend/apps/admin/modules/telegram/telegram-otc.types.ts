export enum TelegramOtcRateSource {
  BINANCE = 'BINANCE',
  OKX = 'OKX',
  OKX_BLOCK = 'OKX_BLOCK',
}

export enum TelegramOtcPaymentMethod {
  ALL = 'ALL',
  ALIPAY = 'ALIPAY',
  BANK = 'BANK',
  WECHAT = 'WECHAT',
}

export interface TelegramOtcConfigView {
  botId: string
  chatId: string
  paymentMethod: TelegramOtcPaymentMethod
  priceRank: number
  rateAdjustment: string
  rateSource: TelegramOtcRateSource
  tenantId: string
}

export interface TelegramOtcMarketAd {
  availableAmount: string
  fetchedAt: Date
  maxFiatAmount?: string
  merchantName: string
  minFiatAmount?: string
  paymentMethods: TelegramOtcPaymentMethod[]
  price: string
  rawId: string
}

export interface TelegramOtcQuote {
  ads: TelegramOtcMarketAd[]
  config: TelegramOtcConfigView
  effectiveRate: string
  paymentMethod: TelegramOtcPaymentMethod
  selected: TelegramOtcMarketAd
}
