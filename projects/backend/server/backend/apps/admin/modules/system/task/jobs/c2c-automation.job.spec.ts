import { C2cAutomationJob } from './c2c-automation.job'

describe('C2cAutomationJob order discovery', () => {
  const now = new Date('2026-09-13T02:00:00.000Z')
  const due = [
    { tenantId: 'tenant-1', merchantId: 'merchant-1' },
    { tenantId: 'tenant-2', merchantId: 'merchant-2' },
  ]
  const store = { claimDue: jest.fn().mockResolvedValue(due) }
  const sync = { sync: jest.fn() }

  beforeEach(() => jest.clearAllMocks())

  it('claims only due merchants and continues when one merchant fails', async () => {
    sync.sync
      .mockResolvedValueOnce({ scanned: 1 })
      .mockRejectedValueOnce(new Error('upstream down'))
    const job = new C2cAutomationJob(store as never, sync as never)

    await expect(job.syncDueOrders(now)).resolves.toEqual({ claimed: 2, succeeded: 1, failed: 1 })
    expect(store.claimDue).toHaveBeenCalledWith(expect.any(String), now, 20, 120_000)
    expect(sync.sync).toHaveBeenNthCalledWith(1, 'tenant-1', 'merchant-1', now)
    expect(sync.sync).toHaveBeenNthCalledWith(2, 'tenant-2', 'merchant-2', now)
  })
})
