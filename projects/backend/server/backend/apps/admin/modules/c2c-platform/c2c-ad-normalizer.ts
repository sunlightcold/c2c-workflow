import Big from 'big.js'
import type { C2cAd, C2cAdSide, C2cMarketQuote } from './c2c-ad.types'
import { C2cRequestRejectedError } from './c2c-platform.types'

export function adText(value: unknown, field: string): string {
  if ((typeof value !== 'string' && typeof value !== 'number') || !String(value).trim()) {
    throw new Error(`广告字段 ${field} 缺失`)
  }
  return String(value).trim()
}

export function adId(value: unknown, field: string): string {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(`广告字段 ${field} 存在精度损失`)
  }
  return adText(value, field)
}

function amount(value: unknown, field: string, positive = false): string {
  const parsed = new Big(adText(value, field))
  if (positive ? parsed.lte(0) : parsed.lt(0)) {
    throw new Error(`广告字段 ${field} 必须${positive ? '大于' : '大于等于'} 0`)
  }
  return parsed.toFixed()
}

function limits(minimum: unknown, maximum: unknown) {
  const minFiatAmount = amount(minimum, 'minFiatAmount')
  const maxFiatAmount = amount(maximum, 'maxFiatAmount')
  if (new Big(minFiatAmount).gt(maxFiatAmount)) throw new Error('广告最低限额不能大于最高限额')
  return { minFiatAmount, maxFiatAmount }
}

function side(value: unknown): C2cAdSide {
  const direction = adText(value, 'side').toUpperCase()
  if (direction !== 'BUY' && direction !== 'SELL') throw new Error('广告方向无效')
  return direction
}

function binanceMethods(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('广告 tradeMethods 无效')
  return value.flat().map((method) => adText(method.identifier, 'identifier'))
}

function okxMethods(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('广告 paymentMethods 无效')
  return value.map((method) => adText(method, 'paymentMethods'))
}

export function normalizeBinanceAd(raw: Record<string, unknown>): C2cAd {
  // 币安接口文档.pdf，AdDetailResp（第 31 页）：1 在线、3 离线、4 关闭。
  const status = raw.advStatus
  return {
    platformAdId: adId(raw.advNo, 'advNo'),
    asset: adText(raw.asset, 'asset').toUpperCase(),
    fiatCurrency: adText(raw.fiatUnit, 'fiatUnit').toUpperCase(),
    side: side(raw.tradeType),
    price: amount(raw.price, 'price', true),
    status: status === 1 ? 'ONLINE' : status === 3 || status === 4 ? 'OFFLINE' : 'UNKNOWN',
    availableAmount: amount(raw.surplusAmount, 'surplusAmount'),
    ...limits(raw.minSingleTransAmount, raw.maxSingleTransAmount),
    paymentMethods: binanceMethods(raw.tradeMethods),
  }
}

export function normalizeBinanceMarketQuote(
  raw: { adv: Record<string, unknown>; advertiser: Record<string, unknown> },
  merchantSide: C2cAdSide,
): C2cMarketQuote {
  const merchantDirection = side(raw.adv.tradeType)
  if (merchantDirection !== merchantSide)
    throw new C2cRequestRejectedError('币安行情广告方向与查询不一致', 'AD_MARKET_SIDE_MISMATCH')
  return {
    platformAdId: adId(raw.adv.advNo, 'advNo'),
    activeSeconds:
      typeof raw.advertiser.activeTimeInSecond === 'number'
        ? raw.advertiser.activeTimeInSecond
        : null,
    traderNickname: adText(raw.advertiser.nickName, 'nickName'),
    asset: adText(raw.adv.asset, 'asset').toUpperCase(),
    fiatCurrency: adText(raw.adv.fiatUnit, 'fiatUnit').toUpperCase(),
    side: merchantDirection,
    price: amount(raw.adv.price, 'price', true),
    ...limits(raw.adv.minSingleTransAmount, raw.adv.dynamicMaxSingleTransAmount),
    paymentMethods: binanceMethods(raw.adv.tradeMethods),
  }
}

export function normalizeOkxAd(raw: Record<string, unknown>): C2cAd {
  return {
    platformAdId: adId(raw.publicId, 'publicId'),
    asset: adText(raw.baseCurrency, 'baseCurrency').toUpperCase(),
    fiatCurrency: adText(raw.quoteCurrency, 'quoteCurrency').toUpperCase(),
    side: side(raw.side),
    price: amount(raw.price, 'price', true),
    status: raw.online === true ? 'ONLINE' : raw.online === false ? 'OFFLINE' : 'UNKNOWN',
    availableAmount: amount(raw.availableAmount, 'availableAmount'),
    ...limits(raw.quoteMinAmountPerOrder, raw.quoteMaxAmountPerOrder),
    paymentMethods: okxMethods(raw.paymentMethods),
  }
}

export function normalizeOkxMarketQuote(
  raw: Record<string, unknown>,
  merchantSide: C2cAdSide,
  asset: string,
  fiatCurrency: string,
): C2cMarketQuote {
  return {
    platformAdId: adId(raw.publicId, 'publicId'),
    traderNickname: adText(raw.nickName, 'nickName'),
    asset,
    fiatCurrency,
    side: merchantSide,
    price: amount(raw.price, 'price', true),
    ...limits(raw.quoteMinAmountPerOrder, raw.quoteMaxAmountPerOrder),
    paymentMethods: okxMethods(raw.paymentMethods),
  }
}
