import { PaymentBatchStatus, PaymentOrderStatus } from '@admin/database'
import { TelegramQueryService } from './telegram-query.service'

describe('TelegramQueryService', () => {
  const batchItems = { find: jest.fn() }
  const orders = { find: jest.fn(), findOne: jest.fn() }
  const batches = { findOne: jest.fn() }
  const receipts = { getReceipt: jest.fn() }
  const downloader = { download: jest.fn() }
  const receiptImages = { convert: jest.fn() }
  const c2cReports = { getProviderDailyReport: jest.fn() }
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

  beforeEach(() => jest.clearAllMocks())

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
    dataSource.query.mockResolvedValue([
      {
        totalCount: '3',
        totalAmount: '60.00',
        awaitSubmitCount: '0',
        processingCount: '1',
        successCount: '2',
        failedCount: '0',
        successAmount: '50.00',
      },
    ])

    const reply = await service.todayStats('tenant-1', 'merchant-1')

    expect(reply.text).toContain('成功笔数：<code>2</code> 笔')
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('"merchantId" = $2'), [
      'tenant-1',
      'merchant-1',
      expect.any(Date),
      expect.any(Date),
    ])
  })

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
