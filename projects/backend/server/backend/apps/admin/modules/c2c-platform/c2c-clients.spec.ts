import { Test } from '@nestjs/testing'
import { BinanceC2cClient } from './binance-c2c.client'
import { OkxWebPrivateClient } from './okx-web-private.client'
import { C2C_HTTP_TRANSPORT, C2cBuyOrderStatus } from './c2c-platform.types'
import { generateKeyPairSync, verify } from 'node:crypto'

describe('C2C buy-order clients', () => {
  const http = { request: jest.fn() }
  let binance: BinanceC2cClient
  let okx: OkxWebPrivateClient

  beforeEach(async () => {
    jest.clearAllMocks()
    http.request.mockReset()
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

  it('declares every supported and unsupported provider capability explicitly', () => {
    expect(binance.getCapabilities()).toEqual({
      appeal: true,
      cancelOrder: false,
      chat: true,
      checkAntiFraud: false,
      getOrderDetail: true,
      listOrders: true,
      listReportOrders: false,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    })
    expect(okx.getCapabilities()).toEqual({
      appeal: false,
      cancelOrder: false,
      chat: false,
      checkAntiFraud: true,
      getOrderDetail: true,
      listOrders: true,
      listReportOrders: false,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    })
    expect(
      binance.getMarkPaidPolicy({
        apiKey: 'key',
        secretKey: 'secret',
        clientType: 'WEB',
        timeoutMs: 5000,
      }),
    ).toEqual({ paymentProof: 'NONE' })
    expect(
      okx.getMarkPaidPolicy({
        cookie: 'cookie',
        authorization: 'token',
        timeoutMs: 5000,
        skipPaymentProofUpload: true,
      }),
    ).toEqual({
      paymentProof: 'SKIP',
    })
    expect(
      okx.getMarkPaidPolicy({
        cookie: 'cookie',
        authorization: 'token',
        timeoutMs: 5000,
        skipPaymentProofUpload: false,
      }),
    ).toEqual({
      paymentProof: 'REQUIRED',
    })
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

  it('retrieves Binance chat credentials and sends the pfa-pay text message shape', async () => {
    const originalWebSocket = globalThis.WebSocket
    const sent: string[] = []
    class FakeWebSocket {
      bufferedAmount = 0
      private readonly listeners = new Map<string, Array<() => void>>()

      constructor(readonly url: string) {
        queueMicrotask(() => this.emit('open'))
      }

      addEventListener(type: string, listener: () => void) {
        this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
      }

      send(message: string) {
        sent.push(message)
      }

      close() {
        this.emit('close')
      }

      private emit(type: string) {
        for (const listener of this.listeners.get(type) ?? []) listener()
      }
    }
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: FakeWebSocket })
    http.request.mockResolvedValue({
      success: true,
      code: '000000',
      data: {
        chatWssUrl: 'wss://im.binance.test/chat',
        listenKey: 'listen-key',
        listenToken: 'listen-token',
      },
    })

    try {
      await expect(
        binance.sendChatText(
          { apiKey: 'key', secretKey: 'secret', clientType: 'WEB', timeoutMs: 5000 },
          'BIN-CHAT-1',
          '订单已付款',
        ),
      ).resolves.toEqual({ supported: true })
    } finally {
      Object.defineProperty(globalThis, 'WebSocket', {
        configurable: true,
        value: originalWebSocket,
      })
    }

    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: expect.stringContaining('/sapi/v1/c2c/chat/retrieveChatCredential?'),
      }),
    )
    expect(JSON.parse(sent[0])).toMatchObject({
      orderNo: 'BIN-CHAT-1',
      type: 'text',
      content: '订单已付款',
      self: true,
      clientType: 'web',
      sendStatus: 0,
    })
  })

  it('keeps OKX private requests on the configured origin and fixed paths', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: {
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
    const detail = await okx.getOrderDetail(
      {
        cookie: 'session',
        authorization: 'token',
        timeoutMs: 5000,
        baseUrl: 'http://127.0.0.1:13002/upstreams/okx',
      },
      '123',
    )
    expect(detail.platformOrderId).toBe('123')
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'http://127.0.0.1:13002/upstreams/okx/v3/c2c/orders/123',
        params: {},
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

  it('signs OKX paid confirmation and uploads the payment proof first', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    http.request
      .mockResolvedValueOnce({ code: '0', data: { imgPath: '/payment-proof/receipt.jpg' } })
      .mockResolvedValueOnce({ code: '0', data: { shouldShowPopup: false } })
      .mockResolvedValueOnce({ code: '0', requestId: 'okx-paid' })
    const credentials = {
      cookie: 'session',
      authorization: 'token',
      signaturePrivateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      timeoutMs: 5000,
      baseUrl: 'https://www.okx.com',
    }
    await expect(
      okx.markOrderAsPaid(credentials, 'order-1', '9007199254740993', {
        fiat: 'CNY',
        paymentProofImages: [
          { content: Buffer.from('receipt'), fileName: 'receipt.jpg', imageType: 'jpeg' },
        ],
      }),
    ).resolves.toMatchObject({ supported: true, requestId: 'okx-paid' })
    expect(http.request).toHaveBeenCalledTimes(3)
    expect(http.request.mock.calls[0][0].body).toBeInstanceOf(FormData)
    const paidRequest = http.request.mock.calls[2][0]
    expect(paidRequest.body).toBe(
      '{"receiptAccountId":9007199254740993,"paymentProofFileUrls":["/payment-proof/receipt.jpg"]}',
    )
    expect(paidRequest.headers).toEqual(
      expect.objectContaining({
        Referer: 'https://www.okx.com/p2p/order?orderId=order-1',
        'x-client-signature-version': '1.3',
      }),
    )
    const signature = Buffer.from(
      paidRequest.headers['x-client-signature'].slice('{P1363}'.length),
      'base64',
    )
    expect(
      verify(
        'sha256',
        Buffer.from(
          `/v3/c2c/orders/order-1/payment/paid${paidRequest.body}${paidRequest.params.t}`,
        ),
        {
          key: publicKey,
          dsaEncoding: 'ieee-p1363',
        },
        signature,
      ),
    ).toBe(true)
  })

  it('continues OKX marking when anti-fraud is unavailable and supports skipping proof upload', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    http.request
      .mockRejectedValueOnce(new Error('risk unavailable'))
      .mockResolvedValueOnce({ code: '0', requestId: 'okx-paid' })
    await expect(
      okx.markOrderAsPaid(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          signaturePrivateKey: privateKey
            .export({ format: 'der', type: 'pkcs8' })
            .toString('base64'),
          baseUrl: 'https://www.okx.com',
        },
        'order-1',
        '1',
        { skipPaymentProofUpload: true },
      ),
    ).resolves.toMatchObject({ requestId: 'okx-paid' })
    expect(http.request).toHaveBeenCalledTimes(2)
    expect(http.request.mock.calls[1][0].body).toBe('{"receiptAccountId":1}')
  })

  it('blocks OKX marking when anti-fraud requires manual review', async () => {
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    http.request.mockResolvedValueOnce({ code: '0', data: { shouldShowPopup: true } })
    await expect(
      okx.markOrderAsPaid(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          signaturePrivateKey: privateKey
            .export({ format: 'der', type: 'pkcs8' })
            .toString('base64'),
          baseUrl: 'https://www.okx.com',
        },
        'order-1',
        '1',
        { skipPaymentProofUpload: true },
      ),
    ).rejects.toThrow('人工复核')
    expect(http.request).toHaveBeenCalledTimes(1)
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
      hasMore: false,
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

  it('skips unexpected Binance list records that are not explicit BUY orders', async () => {
    http.request.mockResolvedValue({
      success: true,
      code: '000000',
      data: [{ orderNumber: 'BIN-SELL', tradeType: 'SELL' }, { orderNumber: 'BIN-NO-SIDE' }],
      total: 2,
    })

    await expect(
      binance.listOrders(
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
      ),
    ).resolves.toEqual({ items: [], total: 2, hasMore: false })
  })

  it('uses Binance structured KYC names and rejects an explicit non-PASS KYC result', async () => {
    const detail = {
      orderNumber: 'BIN-KYC-1',
      orderStatus: 1,
      tradeType: 'BUY',
      asset: 'USDT',
      fiatUnit: 'CNY',
      amount: '10',
      totalPrice: '70.00',
      createTime: 1_787_586_752_664,
      selectedPayId: '2',
      payMethods: [
        {
          id: '2',
          identifier: 'ALIPAY',
          fields: [
            { fieldName: 'beneficiary_name', fieldValue: 'Zhang San' },
            { fieldName: 'bank_account', fieldValue: 'payee@example.com' },
          ],
        },
      ],
      taker: {
        userKycVo: { firstName: 'Zhang', lastName: 'San', kycStatus: 'PASS' },
      },
    }
    http.request
      .mockResolvedValueOnce({ success: true, code: '000000', data: detail })
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        data: { ...detail, taker: { userKycVo: { ...detail.taker.userKycVo, kycStatus: 'FAIL' } } },
      })
    const credentials = {
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
    }

    await expect(binance.getOrderDetail(credentials, 'BIN-KYC-1')).resolves.toMatchObject({
      identityName: 'Zhang San',
      payeeName: 'Zhang San',
      payeeIdentity: 'payee@example.com',
      payable: true,
    })
    await expect(binance.getOrderDetail(credentials, 'BIN-KYC-1')).resolves.toMatchObject({
      payable: false,
      kycStatus: 'FAIL',
      unpayableReason: '卖方 KYC 未通过',
    })
  })

  it('keeps a Binance response without a selected receipt method as an order-level rejection', async () => {
    http.request.mockResolvedValue({
      success: true,
      code: '000000',
      data: {
        orderNumber: 'BIN-NO-PAY-METHOD',
        orderStatus: 1,
        tradeType: 'BUY',
        asset: 'USDT',
        fiatUnit: 'CNY',
        amount: '10',
        totalPrice: '70.00',
        createTime: 1_787_586_752_664,
        payMethods: [],
        taker: { realName: 'Zhang San', userKycVo: { kycStatus: 'PASS' } },
      },
    })

    await expect(
      binance.getOrderDetail(
        { apiKey: 'key', secretKey: 'secret', clientType: 'WEB', timeoutMs: 5000 },
        'BIN-NO-PAY-METHOD',
      ),
    ).resolves.toMatchObject({
      platformPaymentMethodId: '',
      payable: false,
      unpayableReason: '未找到订单选中的收款方式',
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
              id: 260000000000001,
              publicTradingOrderId: 260000000000000,
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
          publicOrderId: 260000000000001,
          side: 'buy',
          orderStatus: 'new',
          orderProcessStatus: 2,
          paymentStatus: 'unpaid',
          baseAmount: '10.00',
          baseCurrency: 'usdt',
          quoteAmount: '70.00',
          quoteCurrency: 'cny',
          createdDate: 1_787_586_752_664,
          orderDetailUserVo: {
            realName: 'Li Si',
            kycVerified: true,
            sellerSelectedReceiptAccount: {
              id: 25990076,
              accountName: 'Li Si',
              accountNo: 'payee@example.com',
              type: 'aliPay',
              bankCode: 'ALIPAY',
            },
          },
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
          platformOrderId: '260000000000001',
          side: 'BUY',
          status: 'PENDING_PAYMENT',
        }),
      ],
      total: 1,
      hasMore: false,
    })
    expect(http.request.mock.calls[0][0].params).toEqual(
      expect.objectContaining({ orderType: 'pending', startTime: '1', endTime: '2' }),
    )
    expect(http.request.mock.calls[0][0].params).not.toHaveProperty('isBuy')
    await expect(okx.getOrderDetail(credentials, '260000000000001')).resolves.toMatchObject({
      platformOrderId: '260000000000001',
      platformPaymentMethodId: '25990076',
      paymentMethod: 'ALIPAY',
      payeeIdentity: 'payee@example.com',
      payeeName: 'Li Si',
      identityName: 'Li Si',
      payable: true,
    })
  })

  it('uses OKX detail-user and receipt-account fallbacks without requiring one response shape', async () => {
    const base = {
      id: 'OKX-FALLBACK-1',
      side: 'buy',
      orderProcessStatus: 2,
      paymentStatus: 'unpaid',
      baseAmount: '10',
      baseCurrency: 'USDT',
      quoteAmount: '70',
      quoteCurrency: 'CNY',
      createdDate: 1_787_586_752_664,
      selectedPayId: '25990076',
      orderDetailUserVo: {
        sellerAllReceiptAccountList: [
          {
            receiptAccountId: '25990076',
            accountName: 'Li Si',
            accountNo: 'payee@example.com',
            type: 'aliPay',
          },
        ],
      },
      detailUser: { realName: 'Li Si', kycVerified: true },
    }
    http.request.mockResolvedValueOnce({ code: 0, data: base }).mockResolvedValueOnce({
      code: 0,
      data: { ...base, detailUser: { realName: 'Li Si', kycVerified: false } },
    })

    await expect(
      okx.getOrderDetail(
        { cookie: 'session', authorization: 'token', timeoutMs: 5000 },
        'OKX-FALLBACK-1',
      ),
    ).resolves.toMatchObject({
      platformPaymentMethodId: '25990076',
      paymentMethod: 'ALIPAY',
      payeeIdentity: 'payee@example.com',
      payeeName: 'Li Si',
      identityName: 'Li Si',
      payable: true,
    })
    await expect(
      okx.getOrderDetail(
        { cookie: 'session', authorization: 'token', timeoutMs: 5000 },
        'OKX-FALLBACK-1',
      ),
    ).resolves.toMatchObject({
      payable: false,
      kycStatus: 'FAIL',
      unpayableReason: '卖方 KYC 未通过',
    })
  })

  it('uses the requested OKX path id instead of treating publicOrderId as the internal id', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: {
        publicOrderId: 260000000000002,
        side: 'buy',
        orderProcessStatus: 2,
        paymentStatus: 'unpaid',
        baseAmount: '10',
        baseCurrency: 'USDT',
        quoteAmount: '70',
        quoteCurrency: 'CNY',
        createdDate: 1_787_586_752_664,
        receiptAccountId: '1',
        sellerReceiptAccount: {
          id: '1',
          accountName: 'Payee',
          accountNo: 'account',
          type: 'aliPay',
        },
        detailUser: { realName: 'Payee', kycVerified: true },
      },
    })

    await expect(
      okx.getOrderDetail(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        '260000000000001',
      ),
    ).resolves.toMatchObject({
      platformOrderId: '260000000000001',
      status: C2cBuyOrderStatus.PENDING_PAYMENT,
      payable: true,
    })
  })

  it('rejects OKX list records without an explicit buy side', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: [
        {
          id: 'OKX-DIRECTION-MISSING',
          orderStatus: 'new',
          paymentStatus: 'unpaid',
          baseAmount: '10.00',
          baseCurrency: 'usdt',
          quoteAmount: '70.00',
          quoteCurrency: 'cny',
          createdDate: 1_787_586_752_664,
        },
      ],
    })

    await expect(
      okx.listOrders(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        {
          tradeType: 'BUY',
          asset: 'USDT',
          startDate: 1,
          endDate: 2,
          page: 1,
          rows: 20,
          orderStatusList: [],
        },
      ),
    ).resolves.toEqual({ items: [], total: 1, hasMore: false })
  })

  it('rejects OKX list records without the internal endpoint order id', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: [
        {
          publicOrderId: 'OKX-PUBLIC-ONLY',
          publicTradingOrderId: 'OKX-TRADING-ONLY',
          side: 'buy',
          orderStatus: 'new',
          paymentStatus: 'unpaid',
          baseAmount: '10.00',
          baseCurrency: 'usdt',
          quoteAmount: '70.00',
          quoteCurrency: 'cny',
          createdDate: 1_787_586_752_664,
        },
      ],
    })

    await expect(
      okx.listOrders(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        {
          tradeType: 'BUY',
          asset: 'USDT',
          startDate: 1,
          endDate: 2,
          page: 1,
          rows: 20,
          orderStatusList: [],
        },
      ),
    ).rejects.toThrow('欧易订单 ID为空')
  })

  it('keeps paging after an OKX page that contains only sell orders', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: {
        items: [
          {
            id: 'OKX-SELL-1',
            side: 'sell',
            orderStatus: 'new',
            paymentStatus: 'unpaid',
            baseAmount: '1',
            baseCurrency: 'USDT',
            quoteAmount: '7',
            quoteCurrency: 'CNY',
            createdDate: 1_787_586_752_664,
          },
        ],
        pageInfo: { totalItemCount: 40 },
      },
    })

    await expect(
      okx.listOrders(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
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
      ),
    ).resolves.toEqual({ items: [], total: 40, hasMore: true })
  })

  it('does not turn OKX UI flags into payment blockers when the order status remains pending', async () => {
    const base = {
      id: 'OKX-BLOCKED-1',
      side: 'buy',
      orderStatus: 'new',
      paymentStatus: 'unpaid',
      baseAmount: '1',
      baseCurrency: 'USDT',
      quoteAmount: '7',
      quoteCurrency: 'CNY',
      createdDate: 1_787_586_752_664,
      receiptAccountId: '1',
      detailUser: {
        realName: 'Payee',
        kycVerified: true,
        sellerSelectedReceiptAccount: {
          id: '1',
          accountName: 'Payee',
          accountNo: 'payee@example.com',
          bankCode: 'ALIPAY',
        },
      },
    }
    http.request
      .mockResolvedValueOnce({ code: 0, data: { ...base, markAsPaidDisabled: true } })
      .mockResolvedValueOnce({ code: 0, data: { ...base, appeal: true } })

    await expect(
      okx.getOrderDetail(
        { cookie: 'session', authorization: 'token', timeoutMs: 5000 },
        'OKX-BLOCKED-1',
      ),
    ).resolves.toMatchObject({ status: C2cBuyOrderStatus.PENDING_PAYMENT, payable: true })
    await expect(
      okx.getOrderDetail(
        { cookie: 'session', authorization: 'token', timeoutMs: 5000 },
        'OKX-BLOCKED-1',
      ),
    ).resolves.toMatchObject({ status: C2cBuyOrderStatus.PENDING_PAYMENT, payable: true })
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

  it('normalizes the latest OKX paid payment status as paid pending release', async () => {
    http.request.mockResolvedValue({
      code: 0,
      data: {
        id: 'OKX-PAID-1',
        side: 'buy',
        orderStatus: 'new',
        orderProcessStatus: 2,
        paymentStatus: 'paid',
        baseAmount: '10',
        baseCurrency: 'USDT',
        quoteAmount: '70',
        quoteCurrency: 'CNY',
        createdDate: 1_787_586_752_664,
        receiptAccountId: '1',
        sellerReceiptAccount: {
          id: '1',
          accountName: 'Payee',
          accountNo: 'account',
          bankCode: 'ALIPAY',
        },
        detailUser: { realName: 'Payee', kycVerified: true },
      },
    })

    await expect(
      okx.getOrderDetail(
        {
          cookie: 'session',
          authorization: 'token',
          timeoutMs: 5000,
          baseUrl: 'https://www.okx.com',
        },
        'OKX-PAID-1',
      ),
    ).resolves.toMatchObject({ status: C2cBuyOrderStatus.PAID, payable: false })
  })

  it('uses the Binance complaint reason, upload and submission contracts', async () => {
    const credentials = {
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 5000,
      baseUrl: 'http://127.0.0.1:13002',
    }
    http.request
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        data: [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
      })
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        data: { uploadUrl: 'http://127.0.0.1:13002/upload', filePath: '/mock/receipt.png' },
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        success: true,
        code: '000000',
        data: { complaintNo: '30006788' },
      })

    await expect(binance.getComplaintReasons(credentials, 'BIN-1')).resolves.toEqual([
      { reasonCode: 6, reasonDesc: '卖家收款后未放行' },
    ])
    const upload = await binance.getComplaintUploadUrl(credentials, 'receipt.png')
    await binance.uploadComplaintFile(upload.uploadUrl, Buffer.from('receipt'))
    await expect(
      binance.submitComplaint(credentials, {
        description: '我已付款给卖家，卖家未放行',
        fileUrls: [upload.filePath],
        orderNo: 'BIN-1',
        reason: '卖家收款后未放行',
        reasonCode: 6,
      }),
    ).resolves.toMatchObject({ data: { complaintNo: '30006788' } })

    expect(http.request).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        method: 'PUT',
        url: 'http://127.0.0.1:13002/upload',
        body: Buffer.from('receipt'),
      }),
    )
  })
})
