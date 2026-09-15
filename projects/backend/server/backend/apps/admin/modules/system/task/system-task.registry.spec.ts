import { C2C_PAYMENT_RECOVERY_INTERVAL_MS, SYSTEM_TASKS } from './system-task.registry'

describe('system task registry', () => {
  it('keeps payment recovery on the fixed 15 second heartbeat', () => {
    expect(C2C_PAYMENT_RECOVERY_INTERVAL_MS).toBe(15_000)
    expect(
      SYSTEM_TASKS.find((task) => task.service === 'C2cAutomationJob.recoverPayments'),
    ).toEqual(expect.objectContaining({ every: 15_000 }))
  })
})
