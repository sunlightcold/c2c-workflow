import { createHmac } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import type { C2cMockAd } from '@mock/upstreams/c2c-ad/mock-ad'
import { getBinanceC2cPlugin } from '@mock/upstreams/binance-c2c/plugin-registry'
import { BinanceC2cState, getBinanceC2cState } from '@mock/upstreams/binance-c2c/state'
import { getOkxC2cPlugin } from '@mock/upstreams/okx-c2c/plugin-registry'
import { OkxC2cState, getOkxC2cState } from '@mock/upstreams/okx-c2c/state'

const ownAd: C2cMockAd = {
  id: '90000000000000000001',
  isOwn: true,
  isMerchant: true,
  periodMinutes: 15,
  asset: 'USDT',
  fiatCurrency: 'CNY',
  side: 'BUY',
  price: '7.1',
  status: 'OFFLINE',
  availableAmount: '123.456789',
  minFiatAmount: '100',
  maxFiatAmount: '5000',
  paymentMethods: ['BANK'],
  receiptIds: ['90000000000000000003'],
  traderNickname: '自己',
}
const peers = [
  {
    ...ownAd,
    isOwn: false,
    status: 'ONLINE' as const,
    id: 'A',
    price: '7.08',
    traderNickname: '同行 A',
  },
  {
    ...ownAd,
    isOwn: false,
    status: 'ONLINE' as const,
    id: 'B',
    price: '7.09',
    traderNickname: '同行 B',
  },
  {
    ...ownAd,
    isOwn: false,
    status: 'ONLINE' as const,
    id: 'SELL',
    side: 'SELL' as const,
    price: '7.20',
    traderNickname: '卖币参考',
  },
]
const binanceRequest = (
  path: string,
  body: Record<string, unknown>,
  params: Record<string, string> = {},
) => {
  const settings = getBinanceC2cState().getSettings()
  const query = { ...params, recvWindow: '5000', timestamp: String(Date.now()) }
  const signature = createHmac('sha256', settings.secretKey)
    .update(new URLSearchParams(query).toString())
    .digest('hex')
  return {
    path,
    body,
    query: { ...query, signature },
    headers: new Headers({ 'X-MBX-APIKEY': settings.apiKey, clientType: settings.clientType }),
  }
}
const okxRequest = (
  method: string,
  path: string,
  query: Record<string, string> = {},
  body: Record<string, unknown> = {},
) => {
  const settings = getOkxC2cState().getSettings()
  return {
    method,
    path,
    query,
    body,
    headers: new Headers({ Cookie: settings.cookie, Authorization: settings.authorization }),
  }
}

describe('C2C advertisement upstream protocols', () => {
  beforeEach(() => {
    getBinanceC2cState().reset()
    getOkxC2cState().reset()
    getBinanceC2cState().ads.clear()
    getOkxC2cState().ads.clear()
    for (const ad of [ownAd, ...peers]) {
      getBinanceC2cState().ads.insert({ ...ad })
      getOkxC2cState().ads.insert({ ...ad })
    }
  })

  it('keeps marketplace advertisements out of the own-ad list and serves decimal strings', () => {
    const binance = getBinanceC2cPlugin().handle(
      binanceRequest('/sapi/v1/c2c/ads/listWithPagination', { page: 1, rows: 100 }),
    )
    expect(binance.body).toMatchObject({
      success: true,
      data: [{ advNo: ownAd.id, surplusAmount: '123.456789', advStatus: 3 }],
    })
    expect((binance.body as { data: unknown[] }).data).toHaveLength(1)
    const okx = getOkxC2cPlugin().handle(
      okxRequest('GET', '/v3/c2c/tradingOrders/getMyAds', { page: '1', pagesize: '100' }),
    )
    expect(okx.body).toMatchObject({
      code: 0,
      data: {
        current: { items: [{ publicId: ownAd.id, availableAmount: '123.456789', online: false }] },
      },
    })
  })

  it('matches the two marketplace direction conventions and preserves best-price ordering', () => {
    const binance = getBinanceC2cPlugin().handle(
      binanceRequest('/bapi/c2c/v2/friendly/c2c/adv/search', {
        tradeType: 'SELL',
        asset: 'USDT',
        fiat: 'CNY',
        page: 1,
        rows: 20,
        transAmount: '1000',
        payTypes: ['BANK'],
      }),
    )
    expect(
      (binance.body as { data: Array<{ adv: { advNo: string } }> }).data.map(
        (quote) => quote.adv.advNo,
      ),
    ).toEqual(['B', 'A'])
    const okx = getOkxC2cPlugin().handle(
      okxRequest('GET', '/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin', {
        side: 'buy',
        cryptoCurrency: 'usdt',
        fiatCurrency: 'cny',
        currentPage: '1',
        numberPerPage: '100',
      }),
    )
    expect(okx.body).toMatchObject({ data: { buy: [{ publicId: 'B' }, { publicId: 'A' }] } })
  })

  it('returns the documented online status from Binance ad detail', () => {
    getBinanceC2cState().ads.update(ownAd.id, (ad) => ({ ...ad, status: 'ONLINE' }))
    const detail = getBinanceC2cPlugin().handle(
      binanceRequest('/sapi/v1/c2c/ads/getDetailByNo', {}, { adsNo: ownAd.id }),
    )
    expect(detail.body).toMatchObject({ data: { advNo: ownAd.id, advStatus: 1 } })
  })

  it('filters certified merchants only when the marketplace query requests them', () => {
    for (const state of [getBinanceC2cState(), getOkxC2cState()]) {
      state.ads.update('A', (ad) => ({ ...ad, isMerchant: true }))
      state.ads.update('B', (ad) => ({ ...ad, isMerchant: false }))
    }
    for (const merchantOnly of [true, false]) {
      const expected = merchantOnly ? ['A'] : ['B', 'A']
      const binance = getBinanceC2cPlugin().handle(
        binanceRequest('/bapi/c2c/v2/friendly/c2c/adv/search', {
          tradeType: 'SELL',
          asset: 'USDT',
          fiat: 'CNY',
          page: 1,
          rows: 20,
          transAmount: '1000',
          payTypes: ['BANK'],
          publisherType: merchantOnly ? 'merchant' : null,
        }),
      )
      expect(
        (binance.body as { data: Array<{ adv: { advNo: string } }> }).data.map(
          ({ adv }) => adv.advNo,
        ),
      ).toEqual(expected)
      const okx = getOkxC2cPlugin().handle(
        okxRequest('GET', '/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin', {
          side: 'buy',
          cryptoCurrency: 'usdt',
          fiatCurrency: 'cny',
          currentPage: '1',
          numberPerPage: '100',
          userType: merchantOnly ? 'certified' : 'all',
        }),
      )
      expect(
        (okx.body as { data: { buy: Array<{ publicId: string }> } }).data.buy.map(
          (ad) => ad.publicId,
        ),
      ).toEqual(expected)
    }
  })

  it('changes only Binance price and keeps the advertisement offline', () => {
    const result = getBinanceC2cPlugin().handle(
      binanceRequest('/sapi/v1/c2c/ads/update', { advNo: ownAd.id, price: '7.13' }),
    )
    expect(result.body).toMatchObject({ success: true, data: true })
    expect(getBinanceC2cState().ads.find(ownAd.id)).toMatchObject({
      price: '7.13',
      status: 'OFFLINE',
      availableAmount: '123.456789',
    })
  })

  it('filters Binance payment periods before paging the marketplace results', () => {
    getBinanceC2cState().ads.update('A', (ad) => ({ ...ad, periodMinutes: 15 }))
    getBinanceC2cState().ads.update('B', (ad) => ({ ...ad, periodMinutes: 30 }))
    for (const [periods, expected] of [
      [[], ['B']],
      [['15'], ['A']],
      [['15', '30'], ['B']],
    ]) {
      const result = getBinanceC2cPlugin().handle(
        binanceRequest('/bapi/c2c/v2/friendly/c2c/adv/search', {
          tradeType: 'SELL',
          asset: 'USDT',
          fiat: 'CNY',
          page: 1,
          rows: 1,
          transAmount: '1000',
          payTypes: ['BANK'],
          periods,
        }),
      )
      expect(
        (result.body as { data: Array<{ adv: { advNo: string } }> }).data.map(
          ({ adv }) => adv.advNo,
        ),
      ).toEqual(expected)
    }
  })

  it('checks fresh OKX protocol metadata and returns its replacement public id without going online', () => {
    getOkxC2cState().ads.update(ownAd.id, (ad) => ({
      ...ad,
      nextPlatformAdId: '90000000000000000004',
    }))
    const path = '/v3/c2c/tradingOrders/modify'
    const rejected = getOkxC2cPlugin().handle(
      okxRequest(
        'POST',
        path,
        {},
        {
          publicId: ownAd.id,
          price: '7.13',
          baseAmount: 'stale',
          receiptIds: ownAd.receiptIds.join(' '),
          online: false,
        },
      ),
    )
    expect(rejected.status).toBe(400)
    const result = getOkxC2cPlugin().handle(
      okxRequest(
        'POST',
        path,
        {},
        {
          publicId: ownAd.id,
          price: '7.13',
          baseAmount: ownAd.availableAmount,
          receiptIds: ownAd.receiptIds.join(' '),
          online: false,
        },
      ),
    )
    expect(result.body).toMatchObject({ code: 0, data: { publicId: '90000000000000000004' } })
    expect(getOkxC2cState().ads.find(ownAd.id)).toBeUndefined()
    expect(getOkxC2cState().ads.find('90000000000000000004')).toMatchObject({
      price: '7.13',
      status: 'OFFLINE',
    })
  })
})

describe('Local merchant demo advertisements', () => {
  beforeEach(() => {
    getBinanceC2cState().reset()
    getOkxC2cState().reset()
  })

  it('provides online and offline buy ads on startup for both platforms', () => {
    for (const state of [new BinanceC2cState(), new OkxC2cState()]) {
      const own = state.ads.list().filter((ad) => ad.isOwn)
      expect(own).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ side: 'BUY', asset: 'USDT', status: 'ONLINE' }),
          expect.objectContaining({ side: 'BUY', asset: 'USDT', status: 'OFFLINE' }),
        ]),
      )
    }
  })

  it('isolates the headquarters and agent Binance ads for list, detail and price updates', () => {
    const request = binanceRequest('/sapi/v1/c2c/ads/listWithPagination', { page: 1, rows: 100 })
    request.headers.set('x-user-id', 'mock-hq-binance')
    const headquarters = getBinanceC2cPlugin().handle(request)
    const headquartersAds = (headquarters.body as { data: Array<{ advNo: string }> }).data
    expect(headquartersAds).toHaveLength(2)
    request.headers.set('x-user-id', 'mock-agent-binance')
    const agent = getBinanceC2cPlugin().handle(request)
    const agentAds = (agent.body as { data: Array<{ advNo: string }> }).data
    expect(agentAds).toHaveLength(1)
    expect(agentAds[0].advNo).not.toBe(headquartersAds[0].advNo)

    const id = headquartersAds[0].advNo
    const detail = binanceRequest('/sapi/v1/c2c/ads/getDetailByNo', {}, { adsNo: id })
    detail.headers.set('x-user-id', 'mock-agent-binance')
    expect(getBinanceC2cPlugin().handle(detail).status).toBe(400)
    const update = binanceRequest('/sapi/v1/c2c/ads/update', { advNo: id, price: '8.00' })
    update.headers.set('x-user-id', 'mock-agent-binance')
    expect(getBinanceC2cPlugin().handle(update).status).toBe(400)
    expect(getBinanceC2cState().ads.find(id)?.price).toBe('7.05')
  })

  it('serves the shared buyer and reference market through both platform protocols', () => {
    const binance = getBinanceC2cPlugin().handle(
      binanceRequest('/bapi/c2c/v2/friendly/c2c/adv/search', {
        tradeType: 'SELL',
        asset: 'USDT',
        fiat: 'CNY',
        page: 1,
        rows: 3,
        transAmount: '1000',
        payTypes: ['BANK'],
      }),
    )
    expect(
      (binance.body as { data: Array<{ adv: { price: string } }> }).data.map(
        ({ adv }) => adv.price,
      ),
    ).toEqual(['7.12', '7.09', '7.08'])
    const okx = getOkxC2cPlugin().handle(
      okxRequest('GET', '/v3/c2c/tradingOrders/getMarketplaceAdsPrelogin', {
        side: 'sell',
        cryptoCurrency: 'usdt',
        fiatCurrency: 'cny',
        currentPage: '1',
        numberPerPage: '3',
      }),
    )
    expect(
      (okx.body as { data: { sell: Array<{ price: string }> } }).data.sell.map(
        ({ price }) => price,
      ),
    ).toEqual(['7.20', '7.21', '7.22'])
  })

  it('restores demo ad prices without resetting merchant credentials or orders', () => {
    for (const state of [getBinanceC2cState(), getOkxC2cState()]) {
      const orders = state.orders.list()
      const settings = state.getSettings()
      const own = state.ads.list().find((ad) => ad.isOwn && ad.status === 'ONLINE')!
      state.ads.update(own.id, (ad) => ({ ...ad, price: '7.13' }))
      state.resetAds()
      expect(state.ads.find(own.id)?.price).toBe('7.05')
      expect(state.orders.list()).toEqual(orders)
      expect(state.getSettings()).toEqual(settings)
      state.reset()
      expect(state.ads.find(own.id)?.price).toBe('7.05')
    }
  })
})
