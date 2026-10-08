import { MerchantPlatform } from '@admin/database'
import type { BinanceCredentials } from './binance-c2c.client'
import { C2cPlatformClient, C2cPlatformCapabilityError } from './c2c-platform.client'
import type { OkxWebPrivateCredentials } from './okx-web-private.client'

describe('C2cPlatformClient', () => {
  const listInput = {
    tradeType: 'BUY' as const,
    asset: 'USDT',
    startDate: 1,
    endDate: 2,
    page: 1,
    rows: 20,
    orderStatusList: [1],
  }
  const binanceCredentials: BinanceCredentials = {
    apiKey: 'key',
    secretKey: 'secret',
    clientType: 'WEB',
    timeoutMs: 5000,
  }
  const okxCredentials: OkxWebPrivateCredentials = {
    cookie: 'cookie',
    authorization: 'token',
    timeoutMs: 5000,
  }
  const binance = {
    listOrders: jest.fn(),
    listReportOrders: jest.fn(),
    getOrderDetail: jest.fn(),
    getOrderDetailRaw: jest.fn(),
    markOrderAsPaid: jest.fn(),
    sendChatText: jest.fn(),
    getComplaintReasons: jest.fn(),
    getComplaintUploadUrl: jest.fn(),
    uploadComplaintFile: jest.fn(),
    submitComplaint: jest.fn(),
    getMarkPaidPolicy: jest.fn().mockReturnValue({ paymentProof: 'NONE' }),
    getCapabilities: jest.fn().mockReturnValue({
      appeal: true,
      cancelOrder: false,
      chat: true,
      checkAntiFraud: false,
      listOrders: true,
      listReportOrders: true,
      getOrderDetail: true,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    }),
  }
  const okx = {
    listOrders: jest.fn(),
    listReportOrders: jest.fn(),
    getOrderDetail: jest.fn(),
    getOrderDetailRaw: jest.fn(),
    markOrderAsPaid: jest.fn(),
    sendChatText: jest.fn(),
    getComplaintReasons: jest.fn(),
    uploadComplaintFile: jest.fn(),
    submitComplaint: jest.fn(),
    getMarkPaidPolicy: jest.fn().mockReturnValue({ paymentProof: 'SKIP' }),
    getCapabilities: jest.fn().mockReturnValue({
      appeal: true,
      cancelOrder: false,
      chat: false,
      checkAntiFraud: true,
      listOrders: true,
      listReportOrders: true,
      getOrderDetail: true,
      markOrderAsPaid: true,
      releaseCrypto: false,
      sellOrders: false,
    }),
  }
  const client = new C2cPlatformClient(binance as never, okx as never)

  beforeEach(() => jest.clearAllMocks())

  it('preserves the complete Binance envelope and uses the existing payment normalizer once', async () => {
    const raw = {
      code: '000000',
      success: true,
      data: {
        orderNumber: '22941455316514955264',
        tradeType: 'BUY',
        orderStatus: 2,
        asset: 'USDT',
        amount: '2954.430000',
        fiatUnit: 'CNY',
        totalPrice: '19647.00',
        createTime: 1791454443171,
        payType: 'ALIPAY',
        selectedPayId: '80061360',
        payAccount: '18516970120',
        payee: '收款人',
        realName: '实名',
        extraField: { original: true },
      },
    }
    binance.getOrderDetailRaw.mockResolvedValue(raw)
    const result = await client.getOrderDetailSnapshot(
      MerchantPlatform.BINANCE,
      binanceCredentials,
      '22941455316514955264',
    )
    expect(result.raw).toEqual(raw)
    expect(result.normalized).toMatchObject({
      platformOrderId: '22941455316514955264',
      fiatAmount: '19647.00',
      status: 'PAID',
      payeeName: '收款人',
    })
    expect(result.normalizationError).toBeNull()
    expect(binance.getOrderDetailRaw).toHaveBeenCalledTimes(1)
    expect(binance.getOrderDetail).not.toHaveBeenCalled()
    expect(okx.getOrderDetailRaw).not.toHaveBeenCalled()
  })

  it('returns the complete OKX response and normalized order from the same query', async () => {
    const raw = {
      code: 0,
      requestId: 'trace-1',
      data: {
        side: 'buy',
        orderStatus: 'cancelled',
        orderProcessStatus: 3,
        baseAmount: '10.00',
        baseCurrency: 'USDT',
        quoteAmount: '70.00',
        quoteCurrency: 'CNY',
        createdDate: 1791454443171,
        originalField: 'unchanged',
      },
    }
    okx.getOrderDetailRaw.mockResolvedValue(raw)
    const result = await client.getOrderDetailSnapshot(
      MerchantPlatform.OKX,
      okxCredentials,
      '260923135225452',
    )
    expect(result.raw).toEqual(raw)
    expect(result.normalized).toMatchObject({
      platformOrderId: '260923135225452',
      status: 'CANCELLED',
      fiatAmount: '70.00',
    })
    expect(result.normalizationError).toBeNull()
    expect(okx.getOrderDetailRaw).toHaveBeenCalledTimes(1)
  })

  it('preserves the complete OKX response even when its order fields cannot be normalized', async () => {
    const raw = { code: 0, requestId: 'trace-1', data: { unexpectedField: true } }
    okx.getOrderDetailRaw.mockResolvedValue(raw)
    const result = await client.getOrderDetailSnapshot(
      MerchantPlatform.OKX,
      okxCredentials,
      '260923135225452',
    )
    expect(result.raw).toEqual(raw)
    expect(result.normalized).toBeNull()
    expect(result.normalizationError).toEqual(expect.any(String))
    expect(okx.getOrderDetailRaw).toHaveBeenCalledTimes(1)
    expect(binance.getOrderDetailRaw).not.toHaveBeenCalled()
  })

  it.each([
    [MerchantPlatform.BINANCE, binance, okx, binanceCredentials],
    [MerchantPlatform.OKX, okx, binance, okxCredentials],
  ])(
    'routes the complete read flow for %s through one provider entry',
    async (platform, selected, other, credentials) => {
      selected.listOrders.mockResolvedValue({ items: [], total: 0, hasMore: false })
      selected.getOrderDetail.mockResolvedValue({ platformOrderId: 'ORDER-1' })

      await expect(client.listOrders(platform, credentials, listInput)).resolves.toEqual({
        hasMore: false,
        items: [],
        total: 0,
      })
      await expect(client.getOrderDetail(platform, credentials, 'ORDER-1')).resolves.toEqual({
        platformOrderId: 'ORDER-1',
      })

      expect(selected.listOrders).toHaveBeenCalledWith(credentials, listInput)
      expect(selected.getOrderDetail).toHaveBeenCalledWith(credentials, 'ORDER-1')
      expect(other.listOrders).not.toHaveBeenCalled()
      expect(other.getOrderDetail).not.toHaveBeenCalled()
    },
  )

  it('preserves the common payment method id and provider-specific mark-paid options', async () => {
    binance.markOrderAsPaid.mockResolvedValue({ data: {} })
    okx.markOrderAsPaid.mockResolvedValue({ supported: true })
    const proof = {
      content: Buffer.from('proof'),
      fileName: 'proof.jpg',
      imageType: 'jpeg' as const,
    }

    await client.markOrderAsPaid(MerchantPlatform.BINANCE, binanceCredentials, 'BIN-1', '901')
    await client.markOrderAsPaid(MerchantPlatform.OKX, okxCredentials, 'OKX-1', '902', {
      fiat: 'CNY',
      paymentProofImages: [proof],
      skipPaymentProofUpload: false,
    })

    expect(binance.markOrderAsPaid).toHaveBeenCalledWith(
      binanceCredentials,
      'BIN-1',
      '901',
      undefined,
    )
    expect(okx.markOrderAsPaid).toHaveBeenCalledWith(okxCredentials, 'OKX-1', '902', {
      fiat: 'CNY',
      paymentProofImages: [proof],
      skipPaymentProofUpload: false,
    })
  })

  it.each([
    [MerchantPlatform.BINANCE, binance, binanceCredentials],
    [MerchantPlatform.OKX, okx, okxCredentials],
  ])(
    'routes merchant reports for %s through its provider adapter',
    async (platform, adapter, credentials) => {
      const input = {
        startTimestamp: 1,
        endTimestamp: 2,
        page: 1,
        rows: 50,
        tradeType: 'BUY' as const,
      }
      adapter.listReportOrders.mockResolvedValue({ items: [], total: 0, hasMore: false })

      await expect(client.listReportOrders(platform, credentials, input)).resolves.toEqual({
        items: [],
        total: 0,
        hasMore: false,
      })
      expect(adapter.listReportOrders).toHaveBeenCalledWith(credentials, input)
    },
  )

  it('delegates the complete OKX appeal flow without routing credentials through Binance', async () => {
    const proof = {
      content: Buffer.from('proof'),
      fileName: 'OKX-1-1.jpg',
      imageType: 'jpeg' as const,
    }
    okx.getComplaintReasons.mockReturnValue([{ reasonCode: 1, reasonDesc: '已付款，催促卖家放币' }])
    okx.uploadComplaintFile.mockResolvedValue('https://okx.example.test/receipt.jpg')
    okx.submitComplaint.mockResolvedValue({ data: { complaintNo: 'request-1' } })

    await expect(
      client.getComplaintReasons(MerchantPlatform.OKX, okxCredentials, 'OKX-1'),
    ).resolves.toEqual([{ reasonCode: 1, reasonDesc: '已付款，催促卖家放币' }])
    await expect(
      client.uploadComplaintFiles(MerchantPlatform.OKX, okxCredentials, 'OKX-1', [
        proof,
        {
          content: Buffer.from('second-page'),
          fileName: 'OKX-1-2.jpg',
          imageType: 'jpeg',
        },
      ]),
    ).resolves.toEqual(['https://okx.example.test/receipt.jpg'])
    await expect(
      client.submitComplaint(MerchantPlatform.OKX, okxCredentials, {
        description: '已付款',
        fileUrls: ['https://okx.example.test/receipt.jpg'],
        orderNo: 'OKX-1',
        reason: '已付款，催促卖家放币',
        reasonCode: 1,
      }),
    ).resolves.toEqual({ data: { complaintNo: 'request-1' } })

    expect(binance.getComplaintReasons).not.toHaveBeenCalled()
    expect(binance.getComplaintUploadUrl).not.toHaveBeenCalled()
    expect(binance.uploadComplaintFile).not.toHaveBeenCalled()
    expect(binance.submitComplaint).not.toHaveBeenCalled()
    expect(okx.uploadComplaintFile).toHaveBeenCalledTimes(1)
    expect(okx.uploadComplaintFile).toHaveBeenCalledWith(okxCredentials, 'OKX-1', proof)
  })

  it('sends Binance chat text and rejects unsupported OKX chat', async () => {
    binance.sendChatText.mockResolvedValue({ supported: true })

    await expect(
      client.sendChatText(MerchantPlatform.BINANCE, binanceCredentials, 'BIN-1', '已付款'),
    ).resolves.toBeUndefined()
    expect(binance.sendChatText).toHaveBeenCalledWith(binanceCredentials, 'BIN-1', '已付款')

    await expect(
      client.sendChatText(MerchantPlatform.OKX, okxCredentials, 'OKX-1', '已付款'),
    ).rejects.toEqual(new C2cPlatformCapabilityError(MerchantPlatform.OKX, 'chat'))
    expect(okx.sendChatText).not.toHaveBeenCalled()
  })

  it('delegates the full Binance appeal flow through the provider entry', async () => {
    binance.getComplaintReasons.mockResolvedValue([{ reasonCode: 1, reasonDesc: '未放币' }])
    binance.getComplaintUploadUrl.mockResolvedValue({ uploadUrl: 'https://upload', filePath: 'a' })
    binance.uploadComplaintFile.mockResolvedValue(undefined)
    binance.submitComplaint.mockResolvedValue({ data: { complaintNo: 'C-1' } })

    await expect(
      client.getComplaintReasons(MerchantPlatform.BINANCE, binanceCredentials, 'BIN-1'),
    ).resolves.toEqual([{ reasonCode: 1, reasonDesc: '未放币' }])
    await expect(
      client.uploadComplaintFiles(MerchantPlatform.BINANCE, binanceCredentials, 'BIN-1', [
        {
          content: Buffer.from('proof'),
          fileName: 'proof.jpg',
          imageType: 'jpeg',
        },
      ]),
    ).resolves.toEqual(['a'])
    await expect(
      client.submitComplaint(MerchantPlatform.BINANCE, binanceCredentials, {
        description: '已付款',
        fileUrls: ['a'],
        orderNo: 'BIN-1',
        reason: '未放币',
        reasonCode: 1,
      }),
    ).resolves.toEqual({ data: { complaintNo: 'C-1' } })
  })
})
