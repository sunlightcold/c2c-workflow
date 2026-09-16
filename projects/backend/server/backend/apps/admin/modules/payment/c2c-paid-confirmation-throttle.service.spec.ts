import { MerchantPlatform } from '@admin/database'
import { C2cPaidConfirmationThrottleService } from './c2c-paid-confirmation-throttle.service'
import { Logger } from '@nestjs/common'

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

  afterEach(() => jest.restoreAllMocks())

  it('does not throttle Binance confirmations', async () => {
    const dataSource = { query: jest.fn() }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)
    const task = jest.fn().mockResolvedValue('done')

    await expect(service.execute(binance, task)).resolves.toBe('done')

    expect(task).toHaveBeenCalledTimes(1)
    expect(dataSource.query).not.toHaveBeenCalled()
  })

  it('atomically reserves one persisted OKX merchant time slot', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValueOnce([[{ id: 'merchant-1' }], 1]),
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

    expect(dataSource.query).toHaveBeenCalledTimes(1)
    expect(dataSource.query.mock.calls[0][0]).toContain('UPDATE merchant')
    expect(dataSource.query.mock.calls[0][0]).toContain('"paidConfirmNextAt" = NOW()')
    expect(dataSource.query.mock.calls[0][0]).toContain('"paidConfirmNextAt" <= NOW()')
    expect(dataSource.query.mock.calls[0][1][2]).toBe(2_000)
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

  it('sleeps until the persisted slot is available instead of polling the database', async () => {
    jest.useFakeTimers().setSystemTime(new Date(0))
    const timeout = jest.spyOn(global, 'setTimeout')
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([{ paidConfirmNextAt: new Date(2_000) }])
        .mockResolvedValueOnce([[{ id: 'merchant-1' }], 1]),
    }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)
    const task = jest.fn().mockResolvedValue('done')
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)

    const result = service.execute(
      {
        ...binance,
        platform: MerchantPlatform.OKX,
        paidConfirmIntervalMinMs: 2_000,
        paidConfirmIntervalMaxMs: 2_000,
      },
      task,
      {
        merchantOrderId: 'merchant-order-1',
        platformOrderId: 'platform-order-1',
        paymentOrderId: 'payment-order-1',
        paymentNo: 'PAY-1',
        paymentUpstreamId: 'alipay-order-1',
        batchId: 'batch-1',
        batchNo: 'BAT-1',
        batchUpstreamId: 'alipay-batch-1',
      },
    )
    await Promise.resolve()
    await Promise.resolve()

    expect(timeout).toHaveBeenCalledWith(expect.any(Function), 2_000)
    await jest.advanceTimersByTimeAsync(2_000)
    await expect(result).resolves.toBe('done')
    expect(dataSource.query).toHaveBeenCalledTimes(3)
    const message = String(log.mock.calls[0]?.[0])
    expect(message).toContain('merchantOrderId=merchant-order-1')
    expect(message).toContain('platformOrderId=platform-order-1')
    expect(message).toContain('paymentOrderId=payment-order-1')
    expect(message).toContain('batchNo=BAT-1')
    jest.useRealTimers()
  })

  it('starts the next OKX order at the next slot without waiting for the previous task', async () => {
    jest.useFakeTimers().setSystemTime(new Date(0))
    let finishFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 'merchant-1' }], 1])
        .mockResolvedValueOnce([[], 0])
        .mockResolvedValueOnce([{ paidConfirmNextAt: new Date(2_000) }])
        .mockResolvedValueOnce([[{ id: 'merchant-1' }], 1]),
    }
    const service = new C2cPaidConfirmationThrottleService(dataSource as never)
    const merchant = {
      ...binance,
      platform: MerchantPlatform.OKX,
      paidConfirmIntervalMinMs: 2_000,
      paidConfirmIntervalMaxMs: 2_000,
    }
    const firstTask = jest.fn(() => firstPending)
    const secondTask = jest.fn().mockResolvedValue('second-done')

    const first = service.execute(merchant, firstTask)
    await Promise.resolve()
    const second = service.execute(merchant, secondTask)
    await Promise.resolve()
    await Promise.resolve()
    expect(secondTask).not.toHaveBeenCalled()

    await jest.advanceTimersByTimeAsync(2_000)
    await expect(second).resolves.toBe('second-done')
    expect(secondTask).toHaveBeenCalledTimes(1)

    finishFirst()
    await first
    jest.useRealTimers()
  })
})
