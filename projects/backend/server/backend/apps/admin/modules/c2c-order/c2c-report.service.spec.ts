import { MerchantPlatform } from '@admin/database'
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
  const platformClient = { getCapabilities: jest.fn(), listReportOrders: jest.fn() }

  beforeEach(() => {
    jest.clearAllMocks()
    merchants.findOne.mockResolvedValue(merchant)
    credentials.getActiveReference.mockResolvedValue({ credentialRef: 'enc://secret' })
    secrets.resolve.mockResolvedValue({ apiKey: 'key', secretKey: 'secret' })
    credentialFactory.create.mockReturnValue({ apiKey: 'key', secretKey: 'secret' })
    platformClient.getCapabilities.mockReturnValue({ listReportOrders: true })
  })

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
          { status: 'COMPLETED', assetAmount: '0.00000001', fiatAmount: '0.10' },
          { status: 'COMPLETED', assetAmount: '12.34567890', fiatAmount: '100.01' },
        ],
        total: 3,
        hasMore: true,
      })
      .mockResolvedValueOnce({
        items: [{ status: 'CANCELLED', assetAmount: '1.2', fiatAmount: '9.999' }],
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
})
