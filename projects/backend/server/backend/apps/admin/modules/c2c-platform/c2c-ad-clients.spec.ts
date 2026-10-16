import type { ProxyNetworkService } from '@/apps/admin/modules/proxy/proxy-network.service'
import { createHmac } from 'node:crypto'
import { MerchantPlatform } from '@admin/database'
import { BinanceC2cClient } from './binance-c2c.client'
import { OkxWebPrivateClient } from './okx-web-private.client'
import { C2cPlatformClient } from './c2c-platform.client'
import type { C2cAdMarketQuery } from './c2c-ad.types'
import { C2cCredentialRejectedError, C2cRequestRejectedError } from './c2c-platform.types'

const binanceAd = {
  advNo: '90000000000000000001',
  asset: 'USDT',
  fiatUnit: 'CNY',
  tradeType: 'BUY',
  price: '7.10',
  advStatus: 1,
  surplusAmount: '123.456789',
  minSingleTransAmount: '100',
  maxSingleTransAmount: '5000',
  dynamicMaxSingleTransAmount: '1000',
  tradeMethods: [{ identifier: 'BANK' }],
}
const okxAd = {
  publicId: '90000000000000000002',
  baseCurrency: 'usdt',
  quoteCurrency: 'cny',
  side: 'buy',
  price: '7.10',
  online: false,
  enterMarket: false,
  type: 'limit',
  availableAmount: '123.456789',
  quoteMinAmountPerOrder: '100',
  quoteMaxAmountPerOrder: '5000',
  paymentMethods: ['BANK'],
  accountVos: [{ receiptDetailVos: [{ receiptAccountId: '90000000000000000003' }] }],
}
const binanceCredentials = {
  apiKey: 'key',
  secretKey: 'secret',
  clientType: 'WEB',
  timeoutMs: 5000,
}
const okxCredentials = { cookie: 'session', authorization: 'token', timeoutMs: 5000 }
const query: C2cAdMarketQuery = {
  asset: 'USDT',
  fiatCurrency: 'CNY',
  side: 'BUY',
  amount: '1000',
  paymentMethods: ['BANK'],
  merchantOnly: true,
  periodMinutes: null,
  limit: 20,
}

describe('C2C advertisement protocol adapters', () => {
  const http = { request: jest.fn() }
  const binance = new BinanceC2cClient(http, {
    forMerchant: jest.fn(),
  } as unknown as ProxyNetworkService)
  const okx = new OkxWebPrivateClient(http)
  const client = new C2cPlatformClient(binance, okx)

  beforeEach(() => http.request.mockReset())

  it.each([
    [1, 'ONLINE'],
    [3, 'OFFLINE'],
    [4, 'OFFLINE'],
  ])(
    'maps documented Binance status %i consistently in list and detail',
    async (advStatus, status) => {
      const ad = { ...binanceAd, advStatus }
      http.request.mockResolvedValueOnce({ code: '000000', success: true, data: [ad] })
      const [listed] = await binance.listAds(binanceCredentials)
      http.request.mockResolvedValueOnce({ code: '000000', success: true, data: ad })
      const detail = await binance.getAd(binanceCredentials, ad.advNo)
      expect(listed.status).toBe(status)
      expect(detail.status).toBe(status)
    },
  )

  it('normalizes both providers into the same own-ad contract without changing decimal amounts', async () => {
    http.request.mockResolvedValueOnce({ code: '000000', success: true, data: [binanceAd] })
    const [binanceResult] = await client.listAds(MerchantPlatform.BINANCE, binanceCredentials)
    http.request.mockResolvedValueOnce({ code: 0, data: { current: { items: [okxAd] } } })
    const [okxResult] = await client.listAds(MerchantPlatform.OKX, okxCredentials)
    expect(binanceResult).toEqual({
      platformAdId: binanceAd.advNo,
      asset: 'USDT',
      fiatCurrency: 'CNY',
      side: 'BUY',
      price: '7.1',
      status: 'ONLINE',
      availableAmount: '123.456789',
      minFiatAmount: '100',
      maxFiatAmount: '5000',
      paymentMethods: ['BANK'],
    })
    expect(okxResult).toEqual({ ...binanceResult, platformAdId: okxAd.publicId, status: 'OFFLINE' })
  })

  it('keeps unrecognized status unknown instead of assuming the advertisement is online', async () => {
    http.request.mockResolvedValueOnce({
      code: '000000',
      success: true,
      data: { ...binanceAd, advStatus: 2 },
    })
    expect((await binance.getAd(binanceCredentials, binanceAd.advNo)).status).toBe('UNKNOWN')
    http.request.mockResolvedValueOnce({
      code: 0,
      data: { current: { items: [{ ...okxAd, online: undefined }] } },
    })
    expect((await okx.getAd(okxCredentials, okxAd.publicId)).status).toBe('UNKNOWN')
  })

  it('signs Binance detail adsNo as a query parameter and submits only the price change', async () => {
    http.request.mockResolvedValueOnce({ code: '000000', success: true, data: binanceAd })
    await binance.getAd(binanceCredentials, binanceAd.advNo)
    const detailRequest = http.request.mock.calls[0][0]
    const url = new URL(detailRequest.url)
    const signature = url.searchParams.get('signature')
    url.searchParams.delete('signature')
    expect(url.searchParams.get('adsNo')).toBe(binanceAd.advNo)
    expect(signature).toBe(
      createHmac('sha256', 'secret').update(url.searchParams.toString()).digest('hex'),
    )
    expect(detailRequest.body).toBeUndefined()
    http.request.mockResolvedValueOnce({ code: '000000', success: true, data: true })
    await expect(
      binance.updateAdPrice(binanceCredentials, binanceAd.advNo, '7.13'),
    ).resolves.toEqual({ platformAdId: binanceAd.advNo })
    expect(http.request.mock.calls[1][0].body).toEqual({ advNo: binanceAd.advNo, price: '7.13' })
  })

  it('treats Binance false update result as an explicit rejection', async () => {
    http.request.mockResolvedValueOnce({ code: '000000', success: true, data: false })
    await expect(
      binance.updateAdPrice(binanceCredentials, binanceAd.advNo, '7.13'),
    ).rejects.toBeInstanceOf(C2cRequestRejectedError)
    expect(http.request).toHaveBeenCalledTimes(1)
  })

  it.each(['BUY', 'SELL'] as const)(
    'translates merchant %s marketplace direction for both providers',
    async (side) => {
      http.request.mockResolvedValueOnce({
        code: '000000',
        success: true,
        data: [{ adv: { ...binanceAd, tradeType: side }, advertiser: { nickName: '同行 B' } }],
      })
      const binanceResult = await binance.searchAds(binanceCredentials, {
        ...query,
        side,
        periodMinutes: 15,
      })
      expect(http.request.mock.calls[0][0]).toMatchObject({
        url: 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
        body: {
          tradeType: side === 'BUY' ? 'SELL' : 'BUY',
          transAmount: '1000',
          payTypes: ['BANK'],
          periods: ['15'],
          publisherType: 'merchant',
        },
      })
      expect(http.request.mock.calls[0][0].headers).not.toHaveProperty('X-MBX-APIKEY')
      expect(binanceResult.quotes[0].side).toBe(side)
      http.request.mockResolvedValueOnce({
        code: 0,
        data: { [side.toLowerCase()]: [{ ...okxAd, nickName: '同行 B' }] },
      })
      const okxResult = await okx.searchAds(okxCredentials, { ...query, side })
      expect(http.request.mock.calls[1][0].params).toMatchObject({
        side: side.toLowerCase(),
        sortType: side === 'BUY' ? 'price_desc' : 'price_asc',
        quoteMinAmountPerOrder: '1000',
        paymentMethod: 'all',
        userType: 'certified',
      })
      expect(okxResult.quotes[0].side).toBe(side)
      expect(okxResult.fetchedAt).toEqual(expect.any(String))
    },
  )

  it('rejects Binance market quotes whose actual advertisement side differs from the query', async () => {
    http.request.mockResolvedValueOnce({
      code: '000000',
      success: true,
      data: [{ adv: { ...binanceAd, tradeType: 'SELL' }, advertiser: { nickName: '卖币同行' } }],
    })
    await expect(binance.searchAds(binanceCredentials, query)).rejects.toBeInstanceOf(
      C2cRequestRejectedError,
    )
  })

  it('rejects an unsupported time filter before making an OKX request', async () => {
    await expect(okx.searchAds(okxCredentials, { ...query, periodMinutes: 15 })).rejects.toThrow(
      '不支持付款时限',
    )
    expect(http.request).not.toHaveBeenCalled()
  })

  it('preserves fresh OKX available amount, receipt ids and offline state, then returns a changed advertisement id', async () => {
    http.request.mockResolvedValueOnce({ code: 0, data: { current: { items: [okxAd] } } })
    http.request.mockResolvedValueOnce({ code: 0, data: { publicId: '90000000000000000004' } })
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).resolves.toEqual({
      platformAdId: '90000000000000000004',
    })
    expect(http.request.mock.calls[1][0].body).toEqual({
      publicId: okxAd.publicId,
      price: '7.13',
      type: 'limit',
      baseAmount: '123.456789',
      receiptIds: '90000000000000000003',
      online: false,
      enterMarket: false,
    })
  })

  it('does not introduce lifecycle flags when OKX did not return them', async () => {
    http.request.mockResolvedValueOnce({
      code: 0,
      data: { current: { items: [{ ...okxAd, online: undefined, enterMarket: undefined }] } },
    })
    http.request.mockResolvedValueOnce({ code: 0, data: { publicId: okxAd.publicId } })
    await okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')
    expect(http.request.mock.calls[1][0].body).not.toHaveProperty('online')
    expect(http.request.mock.calls[1][0].body).not.toHaveProperty('enterMarket')
  })

  it('never converts an OKX floating advertisement into a fixed-price advertisement', async () => {
    http.request.mockResolvedValueOnce({
      code: 0,
      data: { current: { items: [{ ...okxAd, type: 'market' }] } },
    })
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).rejects.toThrow(
      '仅支持固定价格广告',
    )
    expect(http.request).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['missing receipt accounts', { ...okxAd, accountVos: undefined }],
    ['empty receipt accounts', { ...okxAd, accountVos: [] }],
    [
      'invalid receipt identifier',
      {
        ...okxAd,
        accountVos: [{ receiptDetailVos: [{ receiptAccountId: null }] }],
      },
    ],
    ['missing available amount', { ...okxAd, availableAmount: undefined }],
  ])('classifies %s as not submitted and never posts a price update', async (_label, ad) => {
    http.request.mockResolvedValueOnce({ code: 0, data: { current: { items: [ad] } } })
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).rejects.toMatchObject({
      name: 'C2cRequestRejectedError',
      message: '欧易广告改价准备失败，本次未提交',
      responseCode: 'AD_UPDATE_NOT_SUBMITTED',
    })
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(http.request.mock.calls[0][0].method).toBe('GET')
  })

  it('classifies a preparation read timeout as not submitted without exposing transport details', async () => {
    http.request.mockRejectedValueOnce(new Error('timeout with Cookie=secret'))
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).rejects.toMatchObject({
      name: 'C2cRequestRejectedError',
      message: '欧易广告改价准备失败，本次未提交',
      responseCode: 'AD_UPDATE_NOT_SUBMITTED',
    })
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(http.request.mock.calls[0][0].method).toBe('GET')
  })

  it('retains a preparation credential rejection for the shared runner', async () => {
    const rejected = new C2cCredentialRejectedError('欧易 Web 凭据失效', '401')
    http.request.mockRejectedValueOnce(rejected)
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).rejects.toBe(rejected)
    expect(http.request).toHaveBeenCalledTimes(1)
  })

  it('rejects a mismatched or unsafe upstream advertisement identifier', async () => {
    http.request.mockResolvedValueOnce({
      code: '000000',
      success: true,
      data: { ...binanceAd, advNo: 'different' },
    })
    await expect(binance.getAd(binanceCredentials, binanceAd.advNo)).rejects.toThrow('编号不匹配')
    http.request.mockResolvedValueOnce({
      code: '000000',
      success: true,
      data: [{ ...binanceAd, advNo: Number('90000000000000000001') }],
    })
    await expect(binance.listAds(binanceCredentials)).rejects.toThrow('精度损失')
  })

  it('classifies a verified rejection with a safe message and never retries the write', async () => {
    http.request.mockResolvedValueOnce({
      code: 'AD_REJECTED',
      success: false,
      message: 'secret request echo',
    })
    await expect(
      binance.updateAdPrice(binanceCredentials, binanceAd.advNo, '7.13'),
    ).rejects.toMatchObject({
      name: 'C2cRequestRejectedError',
      message: '币安广告请求被拒绝',
      responseCode: 'AD_REJECTED',
    })
    expect(http.request).toHaveBeenCalledTimes(1)
    expect(new C2cRequestRejectedError('固定原因', 'token=secret')).toMatchObject({
      responseCode: 'UPSTREAM_REJECTED',
    })
  })

  it('leaves transport uncertainty intact and does not retry an OKX price update', async () => {
    const timeout = new Error('network timeout')
    http.request.mockResolvedValueOnce({ code: 0, data: { current: { items: [okxAd] } } })
    http.request.mockRejectedValueOnce(timeout)
    await expect(okx.updateAdPrice(okxCredentials, okxAd.publicId, '7.13')).rejects.toBe(timeout)
    expect(http.request).toHaveBeenCalledTimes(2)
  })

  it('does not label an invalid update response as not submitted after the write was sent', async () => {
    http.request.mockResolvedValueOnce({ code: 0, data: { current: { items: [okxAd] } } })
    http.request.mockResolvedValueOnce({ code: 0, data: {} })
    const error = await okx
      .updateAdPrice(okxCredentials, okxAd.publicId, '7.13')
      .catch((value) => value)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(C2cRequestRejectedError)
    expect(http.request).toHaveBeenCalledTimes(2)
    expect(http.request.mock.calls[1][0].method).toBe('POST')
  })
})
