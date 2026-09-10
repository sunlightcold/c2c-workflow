import { PaymentExecutionStatus } from './payment-adapter.types'
import {
  PaymentExecutionCoordinator,
  PaymentNotSubmittedError,
} from './payment-execution-coordinator'
import { PlatformFundsExceptionError } from './payment-execution.errors'
import { PaymentOrderState } from './payment-order-state-machine'
import { ConflictException } from '@nestjs/common'

describe('PaymentExecutionCoordinator', () => {
  const order = { id: 'o1', tenantId: 't1', status: PaymentOrderState.READY }
  const store = { get: jest.fn(), claim: jest.fn(), transition: jest.fn() }
  const executor = { submit: jest.fn(), query: jest.fn() }
  const confirmer = { confirmPaid: jest.fn() }
  let coordinator: PaymentExecutionCoordinator

  beforeEach(() => {
    jest.clearAllMocks()
    store.claim.mockResolvedValue({ ...order, status: PaymentOrderState.SUBMITTING })
    store.get.mockResolvedValue({ ...order, status: PaymentOrderState.UNKNOWN })
    store.transition.mockImplementation(async (_order, status) => ({ ...order, status }))
    coordinator = new PaymentExecutionCoordinator(store, executor, confirmer)
  })

  it('claims an order before sending money and completes platform confirmation separately', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockResolvedValue(undefined)
    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.COMPLETED,
    })
    expect(store.claim).toHaveBeenCalledWith('t1', 'o1')
    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(confirmer.confirmPaid).toHaveBeenCalledTimes(1)
  })

  it('leaves a paid order pending when platform confirmation fails without resending money', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockRejectedValue(new Error('platform unavailable'))
    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.PLATFORM_CONFIRM_PENDING,
    })
    expect(executor.submit).toHaveBeenCalledTimes(1)
  })

  it('moves both sides to funds exception when platform confirmation finds a terminal conflict', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockRejectedValue(new PlatformFundsExceptionError('平台订单已取消'))

    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.FUND_EXCEPTION,
    })
    expect(executor.submit).toHaveBeenCalledTimes(1)
  })

  it('moves transport failures to UNKNOWN and never retries them through submit', async () => {
    executor.submit.mockRejectedValue(new Error('timeout'))
    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.UNKNOWN,
    })
    expect(confirmer.confirmPaid).not.toHaveBeenCalled()
  })

  it('fails an order when preflight proves no payment was submitted', async () => {
    executor.submit.mockRejectedValue(new PaymentNotSubmittedError('平台订单已过期'))

    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.FAILED,
    })
    expect(store.transition).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentOrderState.SUBMITTING }),
      PaymentOrderState.FAILED,
      { errorMessage: '平台订单已过期' },
    )
    expect(confirmer.confirmPaid).not.toHaveBeenCalled()
  })

  it('queries an unknown payment using the original order and confirms the platform on success', async () => {
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockResolvedValue(undefined)

    await expect(coordinator.reconcile('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.COMPLETED,
    })
    expect(executor.submit).not.toHaveBeenCalled()
    expect(executor.query).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1', status: PaymentOrderState.UNKNOWN }),
    )
  })

  it('keeps a payment unknown when its query cannot determine the result', async () => {
    executor.query.mockRejectedValue(new Error('query timeout'))

    await expect(coordinator.reconcile('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.UNKNOWN,
    })
    expect(confirmer.confirmPaid).not.toHaveBeenCalled()
  })

  it('rejects reconciliation for a payment that was never submitted', async () => {
    store.get.mockResolvedValue({ ...order, status: PaymentOrderState.READY })

    await expect(coordinator.reconcile('t1', 'o1')).rejects.toThrow(
      '只有处理中或结果未知的支付订单可以回查',
    )
    await expect(coordinator.reconcile('t1', 'o1')).rejects.toBeInstanceOf(ConflictException)
    expect(executor.query).not.toHaveBeenCalled()
  })
})
