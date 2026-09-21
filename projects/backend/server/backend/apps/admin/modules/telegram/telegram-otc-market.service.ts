import { Injectable } from '@nestjs/common'
import axios from 'axios'
import Big from 'big.js'
import {
  TelegramOtcMarketAd,
  TelegramOtcPaymentMethod,
  TelegramOtcRateSource,
} from './telegram-otc.types'

interface MarketQuery {
  asset?: string
  fiat?: string
  paymentMethod: TelegramOtcPaymentMethod
  rateSource: TelegramOtcRateSource
}

@Injectable()
export class TelegramOtcMarketService {
  async listAds(query: MarketQuery): Promise<TelegramOtcMarketAd[]> {
    const fiat = (query.fiat ?? 'CNY').toUpperCase()
    const asset = (query.asset ?? 'USDT').toUpperCase()
    if (fiat !== 'CNY' || asset !== 'USDT') throw new Error('当前仅支持 USDT/CNY')

    try {
      const ads =
        query.rateSource === TelegramOtcRateSource.BINANCE
          ? await this.listBinance(query.paymentMethod, fiat, asset)
          : await this.listOkx(query.rateSource, query.paymentMethod, fiat, asset)
      if (!ads.length) throw new Error('当前筛选条件没有可用公开报价')
      return ads
    } catch (error) {
      if (axios.isAxiosError(error))
        throw new Error(`${this.sourceLabel(query.rateSource)}公开行情请求失败`)
      if (error instanceof Error) throw error
      throw new Error(`${this.sourceLabel(query.rateSource)}公开行情请求失败`)
    }
  }

  private async listOkx(
    source: TelegramOtcRateSource,
    paymentMethod: TelegramOtcPaymentMethod,
    fiat: string,
    asset: string,
  ): Promise<TelegramOtcMarketAd[]> {
    const paymentMap: Record<TelegramOtcPaymentMethod, string> = {
      ALL: 'all',
      ALIPAY: 'aliPay',
      BANK: 'bank',
      WECHAT: 'wxPay',
    }
    const response = await axios.get('https://www.okx.com/v3/c2c/tradingOrders/books', {
      params: {
        baseCurrency: asset,
        paymentMethod: paymentMap[paymentMethod],
        quoteCurrency: fiat,
        side: 'sell',
        userType: source === TelegramOtcRateSource.OKX_BLOCK ? 'blockTrade' : 'all',
      },
      timeout: 8_000,
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' },
    })
    const payload = response.data
    if (Number(payload?.code) !== 0 || !Array.isArray(payload?.data?.sell))
      throw new Error('欧易公开行情响应异常')
    const fetchedAt = new Date()
    return payload.data.sell
      .filter((item: any) => this.validPair(item?.baseCurrency, item?.quoteCurrency, asset, fiat))
      .filter(
        (item: any) =>
          paymentMethod === TelegramOtcPaymentMethod.ALL ||
          this.okxPayments(item).includes(paymentMethod),
      )
      .map((item: any) => ({
        rawId: String(item.id ?? ''),
        merchantName: this.cleanName(item.nickName),
        price: String(item.price ?? ''),
        availableAmount: String(item.availableAmount ?? '0'),
        ...(item.quoteMinAmountPerOrder
          ? { minFiatAmount: String(item.quoteMinAmountPerOrder) }
          : {}),
        ...(item.quoteMaxAmountPerOrder
          ? { maxFiatAmount: String(item.quoteMaxAmountPerOrder) }
          : {}),
        paymentMethods: this.okxPayments(item),
        fetchedAt,
      }))
      .filter((item: TelegramOtcMarketAd) => item.rawId && this.validPositive(item.price))
      .slice(0, 10)
  }

  private async listBinance(
    paymentMethod: TelegramOtcPaymentMethod,
    fiat: string,
    asset: string,
  ): Promise<TelegramOtcMarketAd[]> {
    const payTypes: Record<TelegramOtcPaymentMethod, string[]> = {
      ALL: [],
      ALIPAY: ['ALIPAY'],
      BANK: ['BANK'],
      WECHAT: ['WECHAT'],
    }
    const body = {
      asset,
      classifies: ['mass', 'profession', 'fiat_trade'],
      fiat,
      page: 1,
      payTypes: payTypes[paymentMethod],
      publisherType: null,
      rows: 10,
      tradeType: 'BUY',
    }
    let response: any
    for (const origin of ['https://p2p.binance.com', 'https://www.binance.com']) {
      try {
        response = await axios.post(`${origin}/bapi/c2c/v2/friendly/c2c/adv/search`, body, {
          timeout: 8_000,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
          },
        })
        break
      } catch {
        // Try the public fallback origin before returning a normalized error.
      }
    }
    if (!response) throw new Error('币安公开行情请求失败')
    const payload = response.data
    if (String(payload?.code) !== '000000' || !payload?.success || !Array.isArray(payload?.data))
      throw new Error('币安公开行情响应异常')
    const fetchedAt = new Date()
    return payload.data
      .filter((item: any) => this.validPair(item?.adv?.asset, item?.adv?.fiatUnit, asset, fiat))
      .filter((item: any) => item?.adv?.advNo && item?.adv?.tradeType === 'SELL')
      .filter(
        (item: any) =>
          paymentMethod === TelegramOtcPaymentMethod.ALL ||
          this.binancePayments(item).includes(paymentMethod),
      )
      .map((item: any) => ({
        rawId: String(item.adv.advNo),
        merchantName: this.cleanName(item.advertiser?.nickName),
        price: String(item.adv.price ?? ''),
        availableAmount: String(item.adv.tradableQuantity ?? item.adv.surplusAmount ?? '0'),
        ...(item.adv.minSingleTransAmount
          ? { minFiatAmount: String(item.adv.minSingleTransAmount) }
          : {}),
        ...(item.adv.dynamicMaxSingleTransAmount || item.adv.maxSingleTransAmount
          ? {
              maxFiatAmount: String(
                item.adv.dynamicMaxSingleTransAmount ?? item.adv.maxSingleTransAmount,
              ),
            }
          : {}),
        paymentMethods: this.binancePayments(item),
        fetchedAt,
      }))
      .filter((item: TelegramOtcMarketAd) => this.validPositive(item.price))
      .slice(0, 10)
  }

  private okxPayments(item: any): TelegramOtcPaymentMethod[] {
    const values = Array.isArray(item?.paymentMethods)
      ? item.paymentMethods.map((value: unknown) => String(value))
      : []
    return this.mapPayments(values)
  }

  private binancePayments(item: any): TelegramOtcPaymentMethod[] {
    const values = Array.isArray(item?.adv?.tradeMethods)
      ? item.adv.tradeMethods
          .flatMap((method: any) => [method?.payType, method?.identifier])
          .filter(Boolean)
      : []
    return this.mapPayments(values)
  }

  private mapPayments(values: string[]): TelegramOtcPaymentMethod[] {
    const normalized = values.map((value) => value.toLowerCase())
    const result: TelegramOtcPaymentMethod[] = []
    if (normalized.some((value) => value.includes('ali')))
      result.push(TelegramOtcPaymentMethod.ALIPAY)
    if (normalized.some((value) => value.includes('bank')))
      result.push(TelegramOtcPaymentMethod.BANK)
    if (normalized.some((value) => value.includes('wechat') || value.includes('wx')))
      result.push(TelegramOtcPaymentMethod.WECHAT)
    return result
  }

  private validPair(base: unknown, quote: unknown, asset: string, fiat: string): boolean {
    return String(base ?? '').toUpperCase() === asset && String(quote ?? '').toUpperCase() === fiat
  }

  private validPositive(value: string): boolean {
    try {
      return new Big(value).gt(0)
    } catch {
      return false
    }
  }

  private cleanName(value: unknown): string {
    return (
      String(value ?? '未知商户')
        .replace(/[\r\n<>]/g, '')
        .slice(0, 30) || '未知商户'
    )
  }

  private sourceLabel(source: TelegramOtcRateSource): string {
    return source === TelegramOtcRateSource.BINANCE ? '币安' : '欧易'
  }
}
