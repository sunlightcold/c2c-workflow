import { MerchantPlatform } from '@admin/database'
import { Logger } from '@nestjs/common'
import { C2cReportService } from './c2c-report.service'

describe('C2cReportService', () => {
  const merchant = {
    id: 'merchant-1',
    tenantId: 'tenant-1',
    platform: MerchantPlatform.BINANCE,
  }
  const merchants = { findOne: jest.fn() }
  const credentials = { getActiveReference: jest.fn() }
  const secrets = { resolve: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const platformClient = {
    getCapabilities: jest.fn(),
    listReportOrders: jest.fn(),
    listOrders: jest.fn(),
  }

  beforeEach(() => {
    jest.resetAllMocks()
    jest.spyOn(Logger.prototype, 'log').mockImplementation()
    jest.spyOn(Logger.prototype, 'error').mockImplementation()
    merchants.findOne.mockResolvedValue(merchant)
    credentials.getActiveReference.mockResolvedValue({ credentialRef: 'enc://secret' })
    secrets.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({ apiKey: 'key', secretKey: 'secret' })
    platformClient.getCapabilities.mockReturnValue({ listReportOrders: true })
    platformClient.listOrders.mockResolvedValue({ items: [], total: 0, hasMore: false })
    platformClient.listReportOrders.mockResolvedValue({ items: [], total: 0, hasMore: false })
  })

  afterEach(() => jest.restoreAllMocks())

  function createService() {
    return new C2cReportService(
      merchants as never,
      credentials as never,
      secrets as never,
      credentialFactory as never,
      platformClient as never,
    )
  }

  it('reads every Binance history page and aggregates exact decimal values by status', async () => {
    platformClient.listReportOrders
      .mockResolvedValueOnce({
        items: [
          {
            platformOrderId: '1',
            status: 'COMPLETED',
            assetAmount: '0.00000001',
            fiatAmount: '0.10',
          },
          {
            platformOrderId: '2',
            status: 'COMPLETED',
            assetAmount: '12.34567890',
            fiatAmount: '100.01',
          },
        ],
        total: 3,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [
          { platformOrderId: '3', status: 'CANCELLED', assetAmount: '1.2', fiatAmount: '9.999' },
        ],
        total: 3,
        hasMore: false,
      })
    const start = new Date('2026-09-15T16:00:00.000Z')
    const end = new Date('2026-09-16T16:00:00.000Z')

    await expect(
      createService().getProviderDailyReport('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual({
      orderCount: 3,
      assetAmount: '13.54567891',
      fiatAmount: '110.109',
      statusSummary: {
        COMPLETED: { orderCount: 2, assetAmount: '12.34567891', fiatAmount: '100.11' },
        CANCELLED: { orderCount: 1, assetAmount: '1.2', fiatAmount: '9.999' },
      },
    })
    expect(platformClient.listReportOrders).toHaveBeenNthCalledWith(
      1,
      MerchantPlatform.BINANCE,
      expect.any(Object),
      {
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime() - 1,
        page: 1,
        rows: 50,
        tradeType: 'BUY',
      },
    )
    expect(platformClient.listReportOrders).toHaveBeenNthCalledWith(
      2,
      MerchantPlatform.BINANCE,
      expect.any(Object),
      expect.objectContaining({ page: 2, rows: 50 }),
    )
  })

  it('queries every OKX upstream report page without using local order data', async () => {
    merchants.findOne.mockResolvedValue({ ...merchant, platform: MerchantPlatform.OKX })
    platformClient.listReportOrders.mockResolvedValue({
      items: [{ status: 'COMPLETED', assetAmount: '20', fiatAmount: '140' }],
      total: 1,
      hasMore: false,
    })

    await expect(
      createService().getProviderDailyReport(
        'tenant-1',
        'merchant-1',
        new Date('2026-09-15T16:00:00.000Z'),
        new Date('2026-09-16T16:00:00.000Z'),
      ),
    ).resolves.toEqual({
      orderCount: 1,
      assetAmount: '20',
      fiatAmount: '140',
      statusSummary: {
        COMPLETED: { orderCount: 1, assetAmount: '20', fiatAmount: '140' },
      },
    })
    expect(platformClient.listReportOrders).toHaveBeenCalledWith(
      MerchantPlatform.OKX,
      expect.any(Object),
      expect.objectContaining({ tradeType: 'BUY' }),
    )
  })

  const start = new Date('2026-10-09T16:00:00Z')
  const end = new Date('2026-10-10T07:30:00Z')
  const order = (id: string, overrides: Record<string, unknown> = {}) => ({
    platformOrderId: id,
    status: 'PENDING_PAYMENT',
    side: 'BUY',
    asset: 'USDT',
    assetAmount: '10',
    fiatCurrency: 'CNY',
    fiatAmount: '70',
    createdAt: '2026-10-10T01:00:00Z',
    ...overrides,
  })

  it.each([MerchantPlatform.BINANCE, MerchantPlatform.OKX])(
    'merges every live and history page for %s without duplicate counting',
    async (platform) => {
      merchants.findOne.mockResolvedValue({ ...merchant, platform })
      platformClient.listOrders
        .mockResolvedValueOnce({ items: [order('1')], total: 2, hasMore: true })
        .mockResolvedValueOnce({ items: [order('2')], total: 2, hasMore: false })
      platformClient.listReportOrders.mockResolvedValueOnce({
        items: [order('1', { status: 'COMPLETED' }), order('3', { status: 'CANCELLED' })],
        total: 2,
        hasMore: false,
      })
      expect(await createService().getProviderOrders('tenant-1', 'merchant-1', start, end)).toEqual(
        [order('1', { status: 'COMPLETED' }), order('2'), order('3', { status: 'CANCELLED' })],
      )
      expect(platformClient.listOrders).toHaveBeenCalledTimes(2)
      expect(platformClient.listOrders).toHaveBeenNthCalledWith(1, platform, expect.any(Object), {
        startDate: start.getTime(),
        endDate: end.getTime() - 1,
        asset: 'USDT',
        tradeType: 'BUY',
        orderStatusList: [],
        page: 1,
        rows: 50,
      })
      expect(credentials.getActiveReference).toHaveBeenCalledTimes(1)
      expect(merchants.findOne).toHaveBeenCalledWith({
        where: { id: 'merchant-1', tenantId: 'tenant-1' },
      })
    },
  )

  it('applies the exact platform creation window and BUY USDT CNY scope', async () => {
    platformClient.listOrders.mockResolvedValue({
      items: [
        order('start', { createdAt: start.toISOString() }),
        order('end', { createdAt: end.toISOString() }),
        order('before', { createdAt: new Date(start.getTime() - 1).toISOString() }),
        order('other-asset', { asset: 'BTC' }),
        order('other-fiat', { fiatCurrency: 'USD' }),
        order('sell', { side: 'SELL' }),
      ],
      total: 6,
      hasMore: false,
    })
    expect(await createService().getProviderOrders('tenant-1', 'merchant-1', start, end)).toEqual([
      order('start', { createdAt: start.toISOString() }),
    ])
  })

  it('does not load another tenant merchant credentials', async () => {
    merchants.findOne.mockResolvedValue(null)
    await expect(
      createService().getProviderOrders('other-tenant', 'merchant-1', start, end),
    ).rejects.toThrow('商家不存在')
    expect(credentials.getActiveReference).not.toHaveBeenCalled()
    expect(platformClient.listOrders).not.toHaveBeenCalled()
  })

  it('rejects repeated pages and does not return partial statistics', async () => {
    platformClient.listOrders.mockResolvedValue({ items: [order('1')], total: 100, hasMore: true })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).rejects.toThrow('分页重复')
    expect(platformClient.listOrders).toHaveBeenCalledTimes(2)
    expect(platformClient.listReportOrders).not.toHaveBeenCalled()
  })

  it('ends pagination on an empty page even when the reported total claims more data', async () => {
    platformClient.listOrders.mockResolvedValueOnce({
      items: [],
      total: 10,
      hasMore: true,
    })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual([])
    expect(platformClient.listOrders).toHaveBeenCalledTimes(1)
  })

  it('rejects repeated SELL-only pages using unfiltered upstream order ids', async () => {
    platformClient.listOrders.mockResolvedValue({
      items: [],
      rawItemCount: 50,
      rawOrderIds: Array.from({ length: 50 }, (_, i) => `sell-${i}`),
      total: 50,
      hasMore: true,
    })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).rejects.toThrow('分页重复')
    expect(platformClient.listOrders).toHaveBeenCalledTimes(2)
  })

  it('continues a unique SELL-only page to reach the following BUY page', async () => {
    platformClient.listOrders
      .mockResolvedValueOnce({
        items: [],
        rawItemCount: 50,
        rawOrderIds: Array.from({ length: 50 }, (_, i) => `sell-${i}`),
        total: 51,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [order('1')],
        rawItemCount: 1,
        rawOrderIds: ['1'],
        total: 51,
        hasMore: false,
      })
    expect(await createService().getProviderOrders('tenant-1', 'merchant-1', start, end)).toEqual([
      order('1'),
    ])
  })

  it('propagates a historical page failure rather than showing pending-only totals', async () => {
    platformClient.listOrders.mockResolvedValueOnce({
      items: [order('1')],
      total: 1,
      hasMore: false,
    })
    platformClient.listReportOrders.mockRejectedValueOnce(new Error('upstream timeout'))
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).rejects.toThrow('upstream timeout')
  })

  it('accepts an empty final page without enforcing the reported total', async () => {
    platformClient.listOrders.mockResolvedValueOnce({
      items: [],
      rawItemCount: 0,
      total: 1,
      hasMore: false,
    })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual([])
    platformClient.listOrders.mockResolvedValueOnce({
      items: [],
      rawItemCount: 1,
      total: 1,
      hasMore: false,
    })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual([])
  })

  it('reads subsequent short pages instead of enforcing the requested page size', async () => {
    platformClient.listOrders
      .mockResolvedValueOnce({
        items: [order('1'), order('2')],
        rawItemCount: 2,
        total: 4,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [order('3'), order('4')],
        rawItemCount: 2,
        total: 4,
        hasMore: false,
      })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual([order('1'), order('2'), order('3'), order('4')])
    expect(platformClient.listOrders).toHaveBeenCalledTimes(2)
    expect(Logger.prototype.log).toHaveBeenCalledWith(
      expect.stringMatching(
        /C2C 统计分页响应: queryId=.+tenantId=tenant-1, merchantId=merchant-1, platform=BINANCE, source=pending, endpoint=\/sapi\/v1\/c2c\/orderMatch\/listOrders, start=.+endExclusive=.+page=1, rows=50, received=2, receivedTotal=2, matched=2, total=4, hasMore=true, continuePaging=true, durationMs=\d+/,
      ),
    )
  })

  it('logs the failed interface, merchant, page, time range and original error', async () => {
    const upstreamError = new Error('[429] Binance request rate limit')
    platformClient.listReportOrders.mockRejectedValueOnce(upstreamError)
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).rejects.toBe(upstreamError)
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringMatching(
        /C2C 统计分页请求失败: queryId=.+tenantId=tenant-1, merchantId=merchant-1, platform=BINANCE, source=history, endpoint=\/sapi\/v1\/c2c\/orderMatch\/listUserOrderHistory, start=.+endExclusive=.+page=1, rows=50, durationMs=\d+, reason=\[429\] Binance request rate limit/,
      ),
      upstreamError.stack,
    )
  })

  it.each([MerchantPlatform.BINANCE, MerchantPlatform.OKX])(
    'reads all short pages for %s when page-based hasMore ends before the accumulated total',
    async (platform) => {
      merchants.findOne.mockResolvedValue({ ...merchant, platform })
      for (const loader of [platformClient.listOrders, platformClient.listReportOrders]) {
        for (let page = 1; page <= 5; page += 1) {
          const items = Array.from({ length: 20 }, (_, i) => order(String((page - 1) * 20 + i)))
          loader.mockResolvedValueOnce({
            items,
            rawItemCount: items.length,
            rawOrderIds: items.map((item) => item.platformOrderId),
            total: 100,
            hasMore: page * 50 < 100,
          })
        }
      }
      const result = await createService().getProviderOrders('tenant-1', 'merchant-1', start, end)
      expect(result).toHaveLength(100)
      expect(result.map((item) => item.platformOrderId)).toEqual(
        Array.from({ length: 100 }, (_, i) => String(i)),
      )
      expect(platformClient.listOrders).toHaveBeenCalledTimes(5)
      expect(platformClient.listReportOrders).toHaveBeenCalledTimes(5)
    },
  )

  it('counts unfiltered rows when continuing past a SELL-only short page', async () => {
    platformClient.listOrders
      .mockResolvedValueOnce({
        items: [],
        rawItemCount: 20,
        rawOrderIds: Array.from({ length: 20 }, (_, i) => `sell-${i}`),
        total: 21,
        hasMore: false,
      })
      .mockResolvedValueOnce({
        items: [order('buy-1')],
        rawItemCount: 1,
        rawOrderIds: ['buy-1'],
        total: 21,
        hasMore: false,
      })
    await expect(
      createService().getProviderOrders('tenant-1', 'merchant-1', start, end),
    ).resolves.toEqual([order('buy-1')])
    expect(platformClient.listOrders).toHaveBeenCalledTimes(2)
  })
})
