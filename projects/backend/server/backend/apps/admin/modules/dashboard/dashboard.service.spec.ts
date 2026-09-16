import { DashboardService } from './dashboard.service'

describe('DashboardService', () => {
  const dataSource = { query: jest.fn() }
  const service = new DashboardService(dataSource as never)
  const now = new Date('2026-09-15T04:00:00.000Z')

  beforeEach(() => jest.clearAllMocks())

  it('returns tenant-scoped multi-angle dashboard statistics for every business date', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          activeBotCount: '1',
          activeGroupCount: '2',
          activeMerchantCount: '3',
          automatedMerchantCount: '2',
          batchCount: '4',
          batchExceptionCount: '1',
          batchProcessingCount: '1',
          batchSuccessCount: '2',
          merchantOrderAmount: '1388.6',
          merchantOrderCount: '8',
          pendingPaymentCount: '2',
          pendingReleaseCount: '1',
          paymentAmount: '1000',
          paymentCount: '5',
          paymentExceptionCount: '1',
          paymentProcessingCount: '1',
          paymentSuccessAmount: '800',
          paymentSuccessCount: '4',
        },
      ])
      .mockResolvedValueOnce([
        {
          date: '2026-09-15',
          merchantOrderAmount: '500',
          merchantOrderCount: '3',
          paymentAmount: '400',
          paymentCount: '2',
          paymentSuccessAmount: '300',
          paymentSuccessCount: '1',
        },
      ])
      .mockResolvedValueOnce([{ amount: '800', count: '4', key: 'COMPLETED' }])
      .mockResolvedValueOnce([{ amount: '700', count: '3', key: 'C2C_BUY' }])
      .mockResolvedValueOnce([
        {
          amount: '900',
          merchantOrderCount: '6',
          paidCount: '4',
          pendingCount: '2',
          platform: 'BINANCE',
        },
      ])
      .mockResolvedValueOnce([
        {
          merchantId: 'merchant-1',
          merchantName: '币安商家',
          paymentAmount: '700',
          paymentCount: '4',
          platform: 'BINANCE',
          successAmount: '600',
          successCount: '3',
        },
      ])

    const result = await service.overview('tenant-1', 7, now)

    expect(result).toMatchObject({
      generatedAt: now.toISOString(),
      range: { dateFrom: '2026-09-09', dateTo: '2026-09-15', days: 7 },
      summary: {
        merchantOrderAmount: '1388.60',
        paymentSuccessAmount: '800.00',
        paymentSuccessRate: '80.00',
      },
      merchantRanking: [
        expect.objectContaining({ merchantName: '币安商家', successRate: '75.00' }),
      ],
    })
    expect(result.dailyTrend).toHaveLength(7)
    expect(result.dailyTrend[0]).toMatchObject({ date: '2026-09-09', paymentCount: 0 })
    expect(result.dailyTrend[6]).toMatchObject({
      date: '2026-09-15',
      paymentSuccessAmount: '300.00',
    })
    expect(dataSource.query).toHaveBeenCalledTimes(6)
    for (const [sql, parameters] of dataSource.query.mock.calls) {
      expect(sql).toContain('"tenantId" = $1')
      expect(parameters[0]).toBe('tenant-1')
    }
    const allSql = dataSource.query.mock.calls.map(([sql]) => sql).join('\n')
    expect(allSql).not.toContain("status IN ('SUCCESS', 'PLATFORM_CONFIRM_PENDING', 'COMPLETED')")
    expect(allSql).toContain("status IN ('SUCCESS')")
  })
})
