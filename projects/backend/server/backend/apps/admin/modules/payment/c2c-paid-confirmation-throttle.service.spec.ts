import { MerchantPlatform } from '@admin/database'
import { C2cPaidConfirmationThrottleService } from './c2c-paid-confirmation-throttle.service'

describe('C2cPaidConfirmationThrottleService', () => {
  const binance = {
    id: 'merchant-1',
    tenantId: 'tenant-1',
    code: 'binance-main',
    platform: MerchantPlatform.BINANCE,
    paidConfirmIntervalMinMs: 2_000,
    paidConfirmIntervalMaxMs: 3_000,
    requestTimeoutMs: 15_000,
  }

  it('does not throttle Binance confirmations', async () => {
    const dataSource = { query: jest.fn() }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)
    const task = jest.fn().mockResolvedValue('done')

    await expect(service.execute(binance, task)).resolves.toBe('done')

    expect(task).toHaveBeenCalledTimes(1)
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('atomically reserves and releases one persisted OKX merchant slot', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'merchant-1' }])
        .mockResolvedValueOnce([]),
    }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)
    const task = jest.fn().mockResolvedValue('done')

    await expect(
      service.execute(
        {
          ...binance,
          platform: MerchantPlatform.OKX,
          paidConfirmIntervalMinMs: 2_000,
          paidConfirmIntervalMaxMs: 2_000,
        },
        task,
      ),
    ).resolves.toBe('done')

    expect(dataSource.query).toHaveBeenCalledTimes(2)
    expect(dataSource.query.mock.calls[0][0]).toContain('UPDATE merchant')
    expect(dataSource.query.mock.calls[0][0]).toContain('"paidConfirmLockUntil" <= NOW()')
    expect(dataSource.query.mock.calls[1][0]).toContain('"paidConfirmNextAt"')
    expect(dataSource.query.mock.calls[1][1][3]).toBe(2_000)
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('rejects an invalid OKX interval before acquiring a lock', async () => {
    const dataSource = { query: jest.fn() }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)

    await expect(
      service.execute(
        {
          ...binance,
          platform: MerchantPlatform.OKX,
          paidConfirmIntervalMinMs: 3_000,
          paidConfirmIntervalMaxMs: 2_000,
        },
        jest.fn(),
      ),
    ).rejects.toThrow('C2C 标记付款间隔配置无效')
    expect(dataSource.query).not.toHaveBeenCalled()
  })
})
