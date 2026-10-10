import { MerchantPlatform, PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { TelegramQueryService } from './telegram-query.service'
import {
  BinanceC2cClient,
  C2cPlatformClient,
  OkxWebPrivateClient,
  C2cBuyOrderStatus,
  type C2cHttpRequest,
} from '../c2c-platform'
import { C2cReportService } from '../c2c-order/c2c-report.service'

describe('TelegramQueryService', () => {
  const batchItems = { find: jest.fn() }
  const orders = { find: jest.fn(), findOne: jest.fn() }
  const batches = { findOne: jest.fn() }
  const receipts = { getReceipt: jest.fn() }
  const downloader = { download: jest.fn() }
  const receiptImages = { convert: jest.fn() }
  const c2cReports = { getProviderDailyReport: jest.fn(), getProviderOrders: jest.fn() }
  const dataSource = {
    getRepository: jest.fn().mockReturnValue(batchItems),
    query: jest.fn(),
  }
  const service = new TelegramQueryService(
    orders as never,
    batches as never,
    dataSource as never,
    receipts as never,
    downloader as never,
    receiptImages as never,
    c2cReports as never,
  )

  beforeEach(() => {
    jest.useRealTimers()
    jest.resetAllMocks()
    dataSource.getRepository.mockReturnValue(batchItems)
    c2cReports.getProviderOrders.mockResolvedValue([])
    dataSource.query.mockResolvedValue([])
  })

  it('queries every supported order identifier only inside the tenant and merchant', async () => {
    orders.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      paymentNo: 'PAY001',
      sourceBusinessNo: 'M001',
      amount: '100.00',
      currency: 'CNY',
      payeeName: 'Zhang San',
      payeeIdentity: '13800138000',
      status: PaymentOrderStatus.SUCCESS,
    })

    const reply = await service.query('tenant-1', 'merchant-1', 'PAY001', {
      canReceipt: true,
      canVoid: true,
    })

    expect(reply.text).toContain('<b>转账订单</b>')
    expect(reply.replyMarkup?.inline_keyboard[0][0].text).toBe('获取回单')
    expect(orders.findOne).toHaveBeenCalledWith({
      where: [
        { tenantId: 'tenant-1', merchantId: 'merchant-1', paymentNo: 'PAY001' },
        { tenantId: 'tenant-1', merchantId: 'merchant-1', sourceBusinessNo: 'PAY001' },
        { tenantId: 'tenant-1', merchantId: 'merchant-1', upstreamId: 'PAY001' },
      ],
    })
  })

  it('falls back to a scoped batch with child details and pagination', async () => {
    orders.findOne.mockResolvedValue(null)
    batches.findOne.mockResolvedValue({
      id: 'batch-id',
      batchNo: 'BAT001',
      currency: 'CNY',
      totalCount: 1,
      totalAmount: '30.00',
      successCount: 1,
      failedCount: 0,
      processingCount: 0,
      unknownCount: 0,
      status: PaymentBatchStatus.SUCCESS,
    })
    batchItems.find.mockResolvedValue([
      {
        paymentOrderId: 'payment-id',
        amount: '30.00',
        status: 'SUCCESS',
        errorMessage: null,
      },
    ])
    orders.find.mockResolvedValue([
      {
        id: 'payment-id',
        sourceBusinessNo: 'M001',
        payeeName: '张三',
        payeeIdentity: '13800138000',
      },
    ])

    const reply = await service.query('tenant-1', 'merchant-1', 'BAT001')

    expect(reply.text).toContain('<b>转账批次</b>')
    expect(reply.text).toContain('商户订单号：<code>M001</code>')
    expect(batches.findOne).toHaveBeenCalledWith({
      where: [
        { tenantId: 'tenant-1', merchantId: 'merchant-1', batchNo: 'BAT001' },
        { tenantId: 'tenant-1', merchantId: 'merchant-1', upstreamId: 'BAT001' },
      ],
    })
  })

  it('returns today statistics scoped to the authorized merchant', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        totalCount: '3',
        totalAmount: '60.00',
        totalAssetAmount: '39.520000000000000000',
        awaitSubmitCount: '0',
        awaitSubmitAssetAmount: '0',
        awaitSubmitAmount: '0',
        processingCount: '1',
        processingAssetAmount: '10.000000000000000000',
        processingAmount: '10.00',
        successCount: '2',
        failedCount: '0',
        successAmount: '50.00',
        successAssetAmount: '29.520000000000000000',
        failedAssetAmount: '0',
        failedAmount: '0',
      },
    ])

    const reply = await service.todayStats('tenant-1', 'merchant-1')

    expect(reply.text).toContain('<b>今日支付统计</b>')
    expect(reply.text).toContain('成功订单：<code>2</code> 笔')
    expect(reply.text).toContain('成功买入：<code>29.52</code> USDT')
    expect(reply.text).toContain(
      '支付中：<code>1</code> 笔 / <code>10</code> USDT / <code>¥10.00</code>',
    )
    expect(reply.text).toContain('汇总：3 笔 / 39.52 USDT / ¥60.00')
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('payment_order."sourceType" = \'C2C_BUY\''),
      ['tenant-1', 'merchant-1', expect.any(Date), expect.any(Date)],
    )
  })

  it('keeps up to 18 decimal places for buy-asset statistics', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        totalCount: '1',
        totalAmount: '1.00',
        totalAssetAmount: '0.123456789012345678',
        awaitSubmitCount: '0',
        awaitSubmitAssetAmount: '0',
        awaitSubmitAmount: '0',
        processingCount: '0',
        processingAssetAmount: '0',
        processingAmount: '0',
        successCount: '1',
        successAssetAmount: '0.123456789012345678',
        successAmount: '1.00',
        failedCount: '0',
        failedAssetAmount: '0',
        failedAmount: '0',
      },
    ])

    const reply = await service.todayStats('tenant-1', 'merchant-1')

    expect(reply.text).toContain('成功买入：<code>0.123456789012345678</code> USDT')
    expect(reply.text).toContain('汇总：1 笔 / 0.123456789012345678 USDT / ¥1.00')
  })

  it('returns yesterday statistics for the complete previous Shanghai business day', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T18:30:00.000Z'))
    dataSource.query.mockResolvedValueOnce([{}])

    const reply = await service.yesterdayStats('tenant-1', 'merchant-1')

    expect(reply.text).toContain('<b>昨日支付统计</b>')
    expect(reply.text).toContain('统计口径：北京时间 昨日 00:00 - 今日 00:00')
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('"merchantId" = $2'), [
      'tenant-1',
      'merchant-1',
      new Date('2026-05-22T16:00:00.000Z'),
      new Date('2026-05-23T16:00:00.000Z'),
    ])
  })

  it('returns current-month statistics from the Shanghai month start until now', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-23T18:30:00.000Z'))
    dataSource.query.mockResolvedValueOnce([{}])

    const reply = await service.currentMonthStats('tenant-1', 'merchant-1')

    expect(reply.text).toContain('<b>当月支付统计</b>')
    expect(reply.text).toContain('统计口径：北京时间 本月 1 日 00:00 - 当前时间')
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('"merchantId" = $2'), [
      'tenant-1',
      'merchant-1',
      new Date('2026-04-30T16:00:00.000Z'),
      new Date('2026-05-23T18:30:00.000Z'),
    ])
  })

  it('queries live orders up to now and matches scoped local records irrespective of payment creation time', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-10T07:30:00Z'))
    c2cReports.getProviderOrders.mockResolvedValue([
      {
        platformOrderId: 'P1',
        status: C2cBuyOrderStatus.COMPLETED,
        assetAmount: '10.000',
        fiatAmount: '70.00',
      },
      {
        platformOrderId: 'P2',
        status: C2cBuyOrderStatus.COMPLETED,
        assetAmount: '20',
        fiatAmount: '140',
      },
    ])
    dataSource.query
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([
        { platformOrderId: 'P1', paymentStatus: 'FAILED', assetAmount: '10', fiatAmount: '70' },
      ])
    const reply = await service.todayStats('tenant-1', 'merchant-1')
    expect(c2cReports.getProviderOrders).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      new Date('2026-10-09T16:00:00Z'),
      new Date('2026-10-10T07:30:00Z'),
    )
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'merchant_order."tenantId" = $1 AND merchant_order."merchantId" = $2',
      ),
      ['tenant-1', 'merchant-1', expect.any(Date), expect.any(Date), ['P1', 'P2']],
    )
    const sql = dataSource.query.mock.calls[1][0]
    expect(sql).toContain('payment_order."tenantId" = merchant_order."tenantId"')
    expect(sql).toContain('payment_order."merchantId" = merchant_order."merchantId"')
    expect(sql).not.toContain('payment_order."createdAt"')
    expect(reply.text).toContain('已完成：2 笔 / 30 USDT / ¥210.00')
    expect(reply.text).toContain('系统未完成付款，平台已完成：1 笔 / 10 USDT / ¥70.00')
    expect(reply.text).toContain('平台订单未同步到系统：1 笔 / 20 USDT / ¥140.00')
    expect(reply.text).not.toContain('<code>P1</code>')
    expect(reply.text).not.toContain('<code>P2</code>')
    expect(reply.text).not.toContain('需核实订单')
    expect(reply.text).toContain('核对结果：2 笔需核实')
    expect(reply.text).toContain('查询时间：10-10 15:30:00')
    expect(reply).not.toHaveProperty('additionalMessages')
  })

  it('preserves system statistics and reports unavailable reconciliation when the platform fails', async () => {
    dataSource.query.mockResolvedValueOnce([
      { successCount: '2', successAmount: '70', successAssetAmount: '10' },
    ])
    c2cReports.getProviderOrders.mockRejectedValue(new Error('平台分页重复 <incomplete>'))
    const reply = await service.yesterdayStats('tenant-1', 'merchant-1')
    expect(reply.text).toContain('成功买入：<code>10</code> USDT')
    expect(reply.text).toContain('查询失败：平台分页重复 &lt;incomplete&gt;')
    expect(reply.text).toContain('暂无法核对')
    expect(reply.text).not.toContain('数据一致')
    expect(dataSource.query).toHaveBeenCalledTimes(1)
  })

  it.each([MerchantPlatform.BINANCE, MerchantPlatform.OKX])(
    'renders paged live %s responses through actual adapters, report service and reconciliation',
    async (platform) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-10-10T07:30:00Z'))
      const created = Date.parse('2026-10-10T01:00:00Z')
      const pending = Array.from({ length: 52 }, (_, i) => ({
        orderNumber: `P${i}`,
        orderStatus: 2,
        tradeType: 'BUY',
        asset: 'USDT',
        amount: '10',
        totalPrice: '70.00',
        fiat: 'CNY',
        createTime: created,
        id: `P${i}`,
        side: 'buy',
        paymentStatus: 'paid',
        baseCurrency: 'usdt',
        baseAmount: '10',
        quoteCurrency: 'cny',
        quoteAmount: '70',
        createdDate: created,
      }))
      const history = ['P0', 'manual', 'cancelled'].map((id) => ({
        ...pending[0],
        id,
        orderNumber: id,
        orderStatus: id === 'cancelled' ? 'CANCELLED' : 'COMPLETED',
      }))
      const pendingRecords =
        platform === MerchantPlatform.OKX
          ? pending.map((item) => ({ ...item, orderStatus: 'new' }))
          : pending
      const historyRecords =
        platform === MerchantPlatform.OKX
          ? history.map((item) => ({ ...item, orderStatus: item.orderStatus.toLowerCase() }))
          : history
      const http = {
        request: jest.fn(async (request: C2cHttpRequest) => {
          const url = new URL(request.url)
          const query = request.params ?? Object.fromEntries(url.searchParams)
          const isPending =
            platform === MerchantPlatform.OKX
              ? query.orderType === 'pending'
              : request.method === 'POST'
          const input =
            platform === MerchantPlatform.BINANCE && isPending
              ? (request.body as Record<string, unknown>)
              : query
          const page = Number(input.page ?? input.pageIndex)
          const rows = Number(input.rows ?? input.pageSize)
          const records = isPending ? pendingRecords : historyRecords
          const items = records.slice((page - 1) * rows, page * rows)
          return platform === MerchantPlatform.OKX
            ? {
                code: 0,
                data: {
                  items,
                  total: records.length,
                },
              }
            : { code: '000000', success: true, data: items, total: records.length }
        }),
      }
      const client = new C2cPlatformClient(
        new BinanceC2cClient(http as never),
        new OkxWebPrivateClient(http as never),
      )
      const merchantRepo = { findOne: jest.fn().mockResolvedValue({ id: 'merchant-1', platform }) }
      const credentials = {
        getActiveReference: jest.fn().mockResolvedValue({ credentialRef: 'enc://test' }),
      }
      const secrets = { resolve: jest.fn().mockResolvedValue({}) }
      const credentialFactory = {
        create: jest.fn().mockReturnValue({
          apiKey: 'key',
          secretKey: 'secret',
          clientType: 'WEB',
          cookie: 'cookie',
          authorization: 'token',
          timeoutMs: 5000,
        }),
      }
      const reports = new C2cReportService(
        merchantRepo as never,
        credentials as never,
        secrets as never,
        credentialFactory as never,
        client,
      )
      const liveService = new TelegramQueryService(
        orders as never,
        batches as never,
        dataSource as never,
        receipts as never,
        downloader as never,
        receiptImages as never,
        reports,
      )
      dataSource.query.mockResolvedValueOnce([{}]).mockResolvedValueOnce([
        {
          platformOrderId: 'P0',
          paymentStatus: 'SUCCESS',
          assetAmount: '10.000',
          fiatAmount: '70',
        },
        { platformOrderId: 'manual', paymentStatus: 'FAILED', assetAmount: '10', fiatAmount: '70' },
        {
          platformOrderId: 'cancelled',
          paymentStatus: 'SUCCESS',
          assetAmount: '10',
          fiatAmount: '70',
        },
      ])
      const reply = await liveService.todayStats('tenant-1', 'merchant-1')
      expect(http.request).toHaveBeenCalledTimes(3)
      expect(reply.text).toContain('已完成：2 笔 / 20 USDT / ¥140.00')
      expect(reply.text).toContain('已付款待放币：51 笔 / 510 USDT / ¥3570.00')
      expect(reply.text).toContain('汇总：54 笔 / 540 USDT / ¥3780.00')
      expect(reply.text).toContain('系统未完成付款，平台已完成：1 笔 / 10 USDT / ¥70.00')
      expect(reply.text).toContain('平台订单未同步到系统：51 笔 / 510 USDT / ¥3570.00')
      expect(reply.text).not.toContain('<code>manual</code>')
      expect(reply.text).not.toContain('需核实订单')
      expect(reply.text.length).toBeLessThanOrEqual(3500)
      expect(reply).not.toHaveProperty('additionalMessages')
      expect(reply.text).toContain('核对结果：53 笔需核实')
      expect(reply.text).toContain('查询时间：10-10 15:30:00')
    },
  )

  it('builds a C2C daily report for an explicit business date', async () => {
    c2cReports.getProviderDailyReport.mockResolvedValue({
      orderCount: 2,
      assetAmount: '20.5',
      fiatAmount: '143.50',
      statusSummary: {
        COMPLETED: { orderCount: 2, assetAmount: '20.5', fiatAmount: '143.50' },
      },
    })

    const reply = await service.dailyReport('tenant-1', 'merchant-1', '20260914')

    expect(reply.text).toContain('<b>C2C 对账日报</b>')
    expect(reply.text).toContain('USDT 总额：<code>20.5</code>')
    expect(c2cReports.getProviderDailyReport).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      expect.any(Date),
      expect.any(Date),
    )
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('renders exact provider totals without native-number aggregation', async () => {
    c2cReports.getProviderDailyReport.mockResolvedValue({
      orderCount: 2,
      assetAmount: '0.300000000000000001',
      fiatAmount: '9007199254740993.03',
      statusSummary: {
        COMPLETED: {
          orderCount: 1,
          assetAmount: '0.1',
          fiatAmount: '9007199254740993.01',
        },
        CANCELLED: { orderCount: 1, assetAmount: '0.200000000000000001', fiatAmount: '0.02' },
      },
    })

    const reply = await service.dailyReport('tenant-1', 'merchant-1', '20260914')

    expect(reply.text).toContain('订单总数：<code>2</code> 笔')
    expect(reply.text).toContain('USDT 总额：<code>0.3</code>')
    expect(reply.text).toContain('法币总额：<code>¥9007199254740993.03</code>')
  })

  it('downloads and converts a ready PDF receipt into JPG photos', async () => {
    orders.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      paymentNo: 'PAY001',
      upstreamId: 'ALIPAY001',
      status: PaymentOrderStatus.SUCCESS,
    })
    receipts.getReceipt.mockResolvedValue({
      status: 'READY',
      downloadUrl: 'https://example.test/receipt.pdf',
      message: '回单已生成',
    })
    downloader.download.mockResolvedValue(Buffer.from('%PDF receipt'))
    receiptImages.convert.mockResolvedValue([
      {
        content: Buffer.from('jpeg-page-1'),
        fileName: 'PAY001-1.jpg',
        height: 1800,
        width: 1200,
      },
    ])
    const reply = await service.receipt('tenant-1', 'merchant-1', 'PAY001')

    expect(receipts.getReceipt).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      '00000000-0000-4000-8000-000000000001',
    )
    expect(downloader.download).toHaveBeenCalledWith('https://example.test/receipt.pdf')
    expect(receiptImages.convert).toHaveBeenCalledWith(Buffer.from('%PDF receipt'), 'PAY001')
    expect(reply.photos).toEqual([
      { content: Buffer.from('jpeg-page-1'), fileName: 'PAY001-1.jpg' },
    ])
    expect(reply.replyMarkup).toBeUndefined()
  })

  it('does not claim that a failed receipt was generated', async () => {
    orders.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      paymentNo: 'PAY001',
      status: PaymentOrderStatus.SUCCESS,
    })
    receipts.getReceipt.mockResolvedValue({ status: 'FAILED', message: '回单生成超时' })

    const reply = await service.receipt('tenant-1', 'merchant-1', 'PAY001')

    expect(reply).toEqual({ text: '回单：回单生成超时' })
    expect(reply.text).not.toContain('回单已生成')
  })
})
