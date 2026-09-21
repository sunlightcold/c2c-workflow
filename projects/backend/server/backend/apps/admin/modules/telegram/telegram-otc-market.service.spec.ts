import axios from 'axios'
import { TelegramOtcMarketService } from './telegram-otc-market.service'
import { TelegramOtcPaymentMethod, TelegramOtcRateSource } from './telegram-otc.types'

describe('TelegramOtcMarketService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('queries OKX block trading on every request with the expected pair', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        code: 0,
        data: {
          sell: [
            {
              id: 'okx-ad-1',
              baseCurrency: 'USDT',
              quoteCurrency: 'CNY',
              nickName: 'OKX 商户',
              price: '7.21',
              availableAmount: '1000',
              paymentMethods: ['aliPay'],
            },
          ],
        },
      },
    })
    const service = new TelegramOtcMarketService()
    const query = {
      rateSource: TelegramOtcRateSource.OKX_BLOCK,
      paymentMethod: TelegramOtcPaymentMethod.ALIPAY,
    }

    await expect(service.listAds(query)).resolves.toEqual([
      expect.objectContaining({ rawId: 'okx-ad-1', price: '7.21' }),
    ])
    await service.listAds(query)

    expect(get).toHaveBeenCalledTimes(2)
    expect(get).toHaveBeenCalledWith(
      'https://www.okx.com/v3/c2c/tradingOrders/books',
      expect.objectContaining({
        params: expect.objectContaining({
          baseCurrency: 'USDT',
          quoteCurrency: 'CNY',
          paymentMethod: 'aliPay',
          side: 'sell',
          userType: 'blockTrade',
        }),
        timeout: 8_000,
      }),
    )
  })

  it('uses the Binance fallback origin and maps bank payment quotes', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockRejectedValueOnce(new Error('primary unavailable'))
      .mockResolvedValueOnce({
        data: {
          code: '000000',
          success: true,
          data: [
            {
              adv: {
                advNo: 'binance-ad-1',
                asset: 'USDT',
                fiatUnit: 'CNY',
                tradeType: 'SELL',
                price: '7.20',
                tradableQuantity: '500',
                tradeMethods: [{ payType: 'BANK' }],
              },
              advertiser: { nickName: '币安商户' },
            },
          ],
        },
      })
    const service = new TelegramOtcMarketService()

    await expect(
      service.listAds({
        rateSource: TelegramOtcRateSource.BINANCE,
        paymentMethod: TelegramOtcPaymentMethod.BANK,
      }),
    ).resolves.toEqual([expect.objectContaining({ rawId: 'binance-ad-1', price: '7.20' })])

    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1][0]).toBe(
      'https://www.binance.com/bapi/c2c/v2/friendly/c2c/adv/search',
    )
    expect(post.mock.calls[1][1]).toEqual(
      expect.objectContaining({ asset: 'USDT', fiat: 'CNY', payTypes: ['BANK'] }),
    )
  })

  it('rejects an empty upstream response instead of producing a zero rate', async () => {
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { code: 0, data: { sell: [] } } })

    await expect(
      new TelegramOtcMarketService().listAds({
        rateSource: TelegramOtcRateSource.OKX,
        paymentMethod: TelegramOtcPaymentMethod.ALL,
      }),
    ).rejects.toThrow('当前筛选条件没有可用公开报价')
  })
})
