import { Test } from '@nestjs/testing'
import { BinanceC2cClient } from './binance-c2c.client'
import { OkxWebPrivateClient } from './okx-web-private.client'
import { C2C_HTTP_TRANSPORT } from './c2c-platform.types'

describe('C2C buy-order clients', () => {
  const http = { request: jest.fn() }
  let binance: BinanceC2cClient
  let okx: OkxWebPrivateClient

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        BinanceC2cClient,
        OkxWebPrivateClient,
        { provide: C2C_HTTP_TRANSPORT, useValue: http },
      ],
    }).compile()
    binance = module.get(BinanceC2cClient)
    okx = module.get(OkxWebPrivateClient)
  })

  it('signs the Binance list request and permits BUY orders only', async () => {
    http.request.mockResolvedValue({ success: true, code: '000000', data: [], total: 0 })
    await binance.listOrders(
      { apiKey: 'key', secretKey: 'secret', clientType: 'WEB', timeoutMs: 5000 },
      {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate: 1,
        endDate: 2,
        page: 1,
        rows: 20,
        orderStatusList: [1],
      },
    )
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringMatching(
          /^https:\/\/api\.binance\.com\/sapi\/v1\/c2c\/orderMatch\/listOrders\?.+signature=/,
        ),
        headers: expect.objectContaining({ 'X-MBX-APIKEY': 'key' }),
      }),
    )
    const invalidInput = {
      tradeType: 'BUY' as const,
      asset: 'USDT',
      startDate: 1,
      endDate: 2,
      page: 1,
      rows: 20,
      orderStatusList: [],
    }
    Object.defineProperty(invalidInput, 'tradeType', { value: 'SELL' })
    await expect(
      binance.listOrders(
        { apiKey: 'key', secretKey: 'secret', clientType: 'WEB', timeoutMs: 5000 },
        invalidInput,
      ),
    ).rejects.toThrow('仅支持 BUY')
  })

  it('keeps OKX private requests on the fixed origin and fixed paths', async () => {
    http.request.mockResolvedValue({ code: 0, data: { id: '123', side: 'buy' } })
    await okx.getOrderDetail({ cookie: 'session', authorization: 'token', timeoutMs: 5000 }, '123')
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'GET', url: 'https://www.okx.com/v3/c2c/orders/123' }),
    )
  })

  it('rejects nonnumeric OKX receipt account ids before sending paid confirmation', async () => {
    await expect(
      okx.markOrderAsPaid(
        { cookie: 'session', authorization: 'token', timeoutMs: 5000 },
        '123',
        'abc',
      ),
    ).rejects.toThrow('receiptAccountId')
    expect(http.request).not.toHaveBeenCalled()
  })
})
