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

  it('signs the Binance list request against the configured API gateway and permits BUY orders only', async () => {
    http.request.mockResolvedValue({ success: true, code: '000000', data: [], total: 0 })
    await binance.listOrders(
      {
        apiKey: 'key',
        secretKey: 'secret',
        clientType: 'WEB',
        timeoutMs: 5000,
        baseUrl: 'http://127.0.0.1:13002/upstreams/binance',
      },
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
          /^http:\/\/127\.0\.0\.1:13002\/upstreams\/binance\/sapi\/v1\/c2c\/orderMatch\/listOrders\?.+signature=/,
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
        {
          apiKey: 'key',
          secretKey: 'secret',
          clientType: 'WEB',
          timeoutMs: 5000,
          baseUrl: 'https://api.binance.com',
        },
        invalidInput,
      ),
    ).rejects.toThrow('仅支持 BUY')
  })

  it('keeps OKX private requests on the configured origin and fixed paths', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: {
        id: '123',
        side: 'buy',
        orderStatus: 'new',
        paymentStatus: 'unpaid',
        baseAmount: '1',
        baseCurrency: 'USDT',
        quoteAmount: '7',
        quoteCurrency: 'CNY',
        createdDate: 1_787_586_752_664,
        receiptAccountId: '1',
        sellerReceiptAccount: { id: '1', accountName: 'Payee', accountNo: 'account' },
        detailUser: { realName: 'Payee', kycVerified: true },
      },
    })
    await okx.getOrderDetail(
      {
        cookie: 'session',
        authorization: 'token',
        timeoutMs: 5000,
        baseUrl: 'http://127.0.0.1:13002/upstreams/okx',
      },
      '123',
    )
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://127.0.0.1:13002/upstreams/okx/v3/c2c/orders/123',
      }),
    )
  })

  it('rejects nonnumeric OKX receipt account ids before sending paid confirmation', async () => {
    await expect(
      okx.markOrderAsPaid(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        '123',
        'abc',
      ),
    ).rejects.toThrow('receiptAccountId')
    expect(http.request).not.toHaveBeenCalled()
  })

  it('requires manual review when OKX anti-fraud requests a popup', async () => {
    http.request.mockResolvedValue({ code: 0, data: { shouldShowPopup: true } })

    await expect(
      okx.checkAntiFraud(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        '123',
        'CNY',
      ),
    ).resolves.toEqual({ riskReviewRequired: true })
  })

  it('normalizes Binance list and detail responses to one buy-order contract', async () => {
    http.request
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        total: 1,
        data: [
          {
            orderNumber: 'BIN-1',
            orderStatus: 1,
            tradeType: 'BUY',
            asset: 'USDT',
            fiat: 'CNY',
            amount: '10',
            totalPrice: '70.00',
            createTime: 1_787_586_752_664,
          },
        ],
      })
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        data: {
          orderNumber: 'BIN-1',
          orderStatus: 1,
          tradeType: 'BUY',
          asset: 'USDT',
          fiatUnit: 'CNY',
          totalPrice: '70.00',
          createTime: 1_787_586_752_664,
          selectedPayId: '2',
          sellerName: 'Zhang San',
          payMethods: [
            {
              id: '2',
              identifier: 'ALIPAY',
              tradeMethodName: 'Alipay',
              fields: [
                { fieldContentType: 'payee', fieldValue: 'Zhang San' },
                { fieldContentType: 'pay_account', fieldValue: 'payee@example.com' },
              ],
            },
          ],
        },
      })
    const credentials = {
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
      baseUrl: 'https://api.binance.com',
    }

    await expect(
      binance.listOrders(credentials, {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate: 1,
        endDate: 2,
        page: 1,
        rows: 20,
        orderStatusList: [1],
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          platformOrderId: 'BIN-1',
          side: 'BUY',
          fiatAmount: '70.00',
          fiatCurrency: 'CNY',
          status: 'PENDING_PAYMENT',
        }),
      ],
      total: 1,
    })
    await expect(binance.getOrderDetail(credentials, 'BIN-1')).resolves.toMatchObject({
      platformOrderId: 'BIN-1',
      platformPaymentMethodId: '2',
      paymentMethod: 'ALIPAY',
      payeeIdentity: 'payee@example.com',
      payeeName: 'Zhang San',
      identityName: 'Zhang San',
      payable: true,
    })
  })

  it('normalizes OKX list envelopes and keeps its internal order id for detail calls', async () => {
    http.request
      .mockResolvedValueOnce({
        code: 0,
        data: {
          total: 1,
          items: [
            {
              id: 'OKX-INTERNAL-1',
              publicTradingOrderId: 'PUBLIC-1',
              side: 'buy',
              orderStatus: 'new',
              orderProcessStatus: 2,
              paymentStatus: 'unpaid',
              baseAmount: '10.00',
              baseCurrency: 'usdt',
              quoteAmount: '70.00',
              quoteCurrency: 'cny',
              createdDate: 1_787_586_752_664,
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        code: 0,
        data: {
          id: 'OKX-INTERNAL-1',
          side: 'buy',
          orderStatus: 'new',
          orderProcessStatus: 2,
          paymentStatus: 'unpaid',
          baseAmount: '10.00',
          baseCurrency: 'usdt',
          quoteAmount: '70.00',
          quoteCurrency: 'cny',
          createdDate: 1_787_586_752_664,
          receiptAccountId: '25990076',
          sellerReceiptAccount: {
            id: '25990076',
            accountName: 'Li Si',
            accountNo: 'payee@example.com',
            type: 'aliPay',
            bankCode: 'ALIPAY',
          },
          detailUser: { realName: 'Li Si', kycVerified: true },
        },
      })
    const credentials = {
      cookie: 'session',
      authorization: 'token',
      timeoutMs: 5000,
      baseUrl: 'https://www.okx.com',
    }

    await expect(
      okx.listOrders(credentials, {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate: 1,
        endDate: 2,
        page: 1,
        rows: 20,
        orderStatusList: [1],
      }),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          platformOrderId: 'OKX-INTERNAL-1',
          side: 'BUY',
          status: 'PENDING_PAYMENT',
        }),
      ],
      total: 1,
    })
    await expect(okx.getOrderDetail(credentials, 'OKX-INTERNAL-1')).resolves.toMatchObject({
      platformOrderId: 'OKX-INTERNAL-1',
      platformPaymentMethodId: '25990076',
      paymentMethod: 'ALIPAY',
      payeeIdentity: 'payee@example.com',
      payeeName: 'Li Si',
      identityName: 'Li Si',
      payable: true,
    })
  })

  it('keeps expired orders distinct from cancelled orders', async () => {
    http.request.mockResolvedValue({
      success: true,
      code: '000000',
      data: [
        {
          orderNumber: 'BIN-EXPIRED',
          orderStatus: 7,
          tradeType: 'BUY',
          asset: 'USDT',
          fiat: 'CNY',
          amount: '1',
          totalPrice: '7',
          createTime: 1_787_586_752_664,
        },
      ],
    })

    const result = await binance.listOrders(
      {
        apiKey: 'key',
        secretKey: 'secret',
        clientType: 'WEB',
        timeoutMs: 5000,
        baseUrl: 'https://api.binance.com',
      },
      {
        tradeType: 'BUY',
        asset: 'USDT',
        startDate: 1,
        endDate: 2,
        page: 1,
        rows: 20,
        orderStatusList: [7],
      },
    )

    expect(result.items[0].status).toBe('EXPIRED')
  })
})
