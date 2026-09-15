import { C2cAutomationJob } from './c2c-automation.job'

describe('C2cAutomationJob order discovery', () => {
  const now = new Date('2026-09-13T02:00:00.000Z')
  const due = [
    { tenantId: 'tenant-1', merchantId: 'merchant-1' },
    { tenantId: 'tenant-2', merchantId: 'merchant-2' },
  ]
  const store = { claimDue: jest.fn().mockResolvedValue(due) }
  const sync = { sync: jest.fn() }
  const automaticPayments = {
    createAndSubmit: jest.fn().mockResolvedValue({ found: 1, succeeded: 1, failed: 0 }),
    submitReadyBatches: jest.fn().mockResolvedValue({ found: 1, succeeded: 1, failed: 0 }),
    recover: jest.fn().mockResolvedValue({ payments: {}, batches: {} }),
  }

  beforeEach(() => jest.clearAllMocks())

  it('claims only due merchants and continues when one merchant fails', async () => {
    sync.sync
      .mockResolvedValueOnce({ scanned: 1 })
      .mockRejectedValueOnce(new Error('upstream down'))
    const job = new C2cAutomationJob(store as never, sync as never, automaticPayments as never)

    await expect(job.syncDueOrders(now)).resolves.toEqual({ claimed: 2, succeeded: 1, failed: 1 })
    expect(store.claimDue).toHaveBeenCalledWith(expect.any(String), now, 20, 120_000)
    expect(sync.sync).toHaveBeenNthCalledWith(1, 'tenant-1', 'merchant-1', now)
    expect(sync.sync).toHaveBeenNthCalledWith(2, 'tenant-2', 'merchant-2', now)
  })

  it('processes newly discovered orders before finishing the discovery run', async () => {
    sync.sync
      .mockResolvedValueOnce({ scanned: 1, created: 1, updated: 0 })
      .mockRejectedValueOnce(new Error('upstream down'))

    const job = new C2cAutomationJob(store as never, sync as never, automaticPayments as never)

    await expect(job.syncDueOrders(now)).resolves.toEqual({
      claimed: 2,
      succeeded: 1,
      failed: 1,
      payments: {
        orders: { found: 1, succeeded: 1, failed: 0 },
        batches: { found: 1, succeeded: 1, failed: 0 },
      },
    })
    expect(automaticPayments.createAndSubmit).toHaveBeenCalledWith(now)
    expect(automaticPayments.submitReadyBatches).toHaveBeenCalledWith(now)
    expect(automaticPayments.createAndSubmit.mock.invocationCallOrder[0]).toBeGreaterThan(
      sync.sync.mock.invocationCallOrder[0],
    )
  })

  it('creates payments before submitting ready batches', async () => {
    const job = new C2cAutomationJob(store as never, sync as never, automaticPayments as never)

    await expect(job.processAutomaticPayments(now)).resolves.toEqual({
      orders: { found: 1, succeeded: 1, failed: 0 },
      batches: { found: 1, succeeded: 1, failed: 0 },
    })
    expect(automaticPayments.createAndSubmit).toHaveBeenCalledWith(now)
    expect(automaticPayments.submitReadyBatches).toHaveBeenCalledWith(now)
    expect(automaticPayments.createAndSubmit.mock.invocationCallOrder[0]).toBeLessThan(
      automaticPayments.submitReadyBatches.mock.invocationCallOrder[0],
    )
  })
})
