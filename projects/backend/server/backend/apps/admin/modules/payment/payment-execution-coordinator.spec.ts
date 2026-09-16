import { PaymentExecutionStatus } from './payment-adapter.types'
import {
  PaymentExecutionCoordinator,
  PaymentNotSubmittedError,
} from './payment-execution-coordinator'
import { PlatformFundsExceptionError } from './payment-execution.errors'
import { PaymentOrderState } from './payment-order-state-machine'
import { ConflictException } from '@nestjs/common'
import { PaymentSourceType, PlatformConfirmationStatus } from '@admin/database'

describe('PaymentExecutionCoordinator', () => {
  const order = {
    id: 'o1',
    tenantId: 't1',
    merchantId: 'm1',
    sourceType: PaymentSourceType.C2C_BUY,
    sourceBusinessNo: 'platform-order-1',
    status: PaymentOrderState.READY,
  }
  const store = {
    get: jest.fn(),
    claim: jest.fn(),
    transition: jest.fn(),
    claimPlatformConfirmation: jest.fn(),
    completePlatformConfirmation: jest.fn(),
    failPlatformConfirmation: jest.fn(),
  }
  const executor = { submit: jest.fn(), query: jest.fn() }
  const confirmer = { confirmPaid: jest.fn() }
  const eventEmitter = { emit: jest.fn() }
  let coordinator: PaymentExecutionCoordinator

  beforeEach(() => {
    jest.clearAllMocks()
    store.claim.mockResolvedValue({ ...order, status: PaymentOrderState.SUBMITTING })
    store.get.mockResolvedValue({ ...order, status: PaymentOrderState.UNKNOWN })
    store.transition.mockImplementation(async (_order, status) => ({ ...order, status }))
    store.claimPlatformConfirmation.mockImplementation(async (current) => ({
      ...current,
      platformConfirmStatus: PlatformConfirmationStatus.PROCESSING,
    }))
    store.completePlatformConfirmation.mockImplementation(async (current) => ({
      ...current,
      status: PaymentOrderState.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
    }))
    store.failPlatformConfirmation.mockImplementation(
      async (current, errorMessage, fundsException) => ({
        ...current,
        status: fundsException ? PaymentOrderState.FUND_EXCEPTION : PaymentOrderState.SUCCESS,
        platformConfirmStatus: PlatformConfirmationStatus.FAILED,
        lastError: errorMessage,
      }),
    )
    coordinator = new PaymentExecutionCoordinator(store, executor, confirmer, eventEmitter as never)
  })

  it('claims an order before sending money and completes platform confirmation separately', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockResolvedValue(undefined)
    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.SUCCESS,
    })
    expect(store.claim).toHaveBeenCalledWith('t1', 'o1')
    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(confirmer.confirmPaid).toHaveBeenCalledTimes(1)
  })

  it('leaves a paid order pending when platform confirmation fails without resending money', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockRejectedValue(new Error('platform unavailable'))
    await expect(coordinator.submit('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.FAILED,
    })
    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'telegram.platform-confirmation.failed',
      expect.objectContaining({ paymentOrderId: 'o1', errorMessage: 'platform unavailable' }),
    )
  })

  it('allows only one concurrent worker to call mark-paid', async () => {
    const pending = {
      ...order,
      status: PaymentOrderState.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.PENDING,
    }
    store.claimPlatformConfirmation
      .mockResolvedValueOnce({
        ...pending,
        platformConfirmStatus: PlatformConfirmationStatus.PROCESSING,
      })
      .mockResolvedValueOnce(null)
    store.get.mockResolvedValue({
      ...pending,
      platformConfirmStatus: PlatformConfirmationStatus.PROCESSING,
    })
    confirmer.confirmPaid.mockResolvedValue(undefined)

    await Promise.all([coordinator.confirmPlatform(pending), coordinator.confirmPlatform(pending)])

    expect(confirmer.confirmPaid).toHaveBeenCalledTimes(1)
    expect(store.completePlatformConfirmation).toHaveBeenCalledTimes(1)
  })

  it('recovers an expired processing claim by querying only and never sends mark-paid blindly', async () => {
    const pending = {
      ...order,
      status: PaymentOrderState.SUCCESS,
      platformConfirmStatus: PlatformConfirmationStatus.PROCESSING,
    }
    confirmer.confirmPaid.mockResolvedValue(undefined)

    await coordinator.confirmPlatform(pending, { recoverProcessing: true })

    expect(confirmer.confirmPaid).toHaveBeenCalledWith(
      expect.objectContaining({ platformConfirmStatus: PlatformConfirmationStatus.PROCESSING }),
      { queryOnly: true },
    )
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

  it('publishes a failed payment status only once', async () => {
    store.claim.mockResolvedValue({
      ...order,
      merchantId: 'm1',
      paymentNo: 'PAY1',
      status: PaymentOrderState.SUBMITTING,
    })
    store.transition.mockImplementation(async (current, status) => ({ ...current, status }))
    executor.submit.mockResolvedValue({
      status: PaymentExecutionStatus.FAILED,
      errorMessage: '收款账户错误',
    })

    await coordinator.submit('t1', 'o1')

    expect(eventEmitter.emit).toHaveBeenCalledTimes(1)
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'telegram.payment.status',
      expect.objectContaining({ status: PaymentOrderState.FAILED }),
    )
  })

  it('queries an unknown payment using the original order and confirms the platform on success', async () => {
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, upstreamId: 'a1' })
    confirmer.confirmPaid.mockResolvedValue(undefined)

    await expect(coordinator.reconcile('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.SUCCESS,
    })
    expect(executor.submit).not.toHaveBeenCalled()
    expect(executor.query).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'o1', status: PaymentOrderState.UNKNOWN }),
    )
  })

  it('recovers a submission interrupted after the request may have left the process', async () => {
    store.get.mockResolvedValue({ ...order, status: PaymentOrderState.SUBMITTING })
    executor.query.mockResolvedValue({
      status: PaymentExecutionStatus.PROCESSING,
      upstreamId: 'a1',
    })

    await expect(coordinator.reconcile('t1', 'o1')).resolves.toMatchObject({
      status: PaymentOrderState.PROCESSING,
    })
    expect(executor.submit).not.toHaveBeenCalled()
    expect(executor.query).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentOrderState.SUBMITTING }),
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
      '只有提交中、处理中或结果未知的支付订单可以回查',
    )
    await expect(coordinator.reconcile('t1', 'o1')).rejects.toBeInstanceOf(ConflictException)
    expect(executor.query).not.toHaveBeenCalled()
  })
})
