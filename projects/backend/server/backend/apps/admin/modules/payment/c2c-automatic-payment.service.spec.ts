import {
  PaymentBatchStatus,
  PaymentExecutionMode,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { EVENT_KEYS } from '../event-emitter'
import { C2cAutomaticPaymentService } from './c2c-automatic-payment.service'

describe('C2cAutomaticPaymentService', () => {
  const now = new Date('2026-09-13T02:00:00.000Z')
  const candidate = {
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    merchantOrderId: 'merchant-order-1',
    paymentOrderId: null,
    paymentOrderStatus: null,
    paymentOrderExecutionMode: null,
  }
  const store = {
    findCandidates: jest.fn(),
    findBatchScopes: jest.fn().mockResolvedValue([]),
    findRecoverablePayments: jest.fn().mockResolvedValue([]),
    findRecoverableBatches: jest.fn().mockResolvedValue([]),
    runLocked: jest.fn((_key, work) => work()),
  }
  const merchantPayments = { create: jest.fn() }
  const paymentOrders = { rematch: jest.fn() }
  const payments = {
    submit: jest.fn(),
    reconcile: jest.fn(),
    confirmPlatform: jest.fn(),
  }
  const batchService = { findReadyGroups: jest.fn(), create: jest.fn() }
  const batchPolicies = {
    evaluateRules: jest.fn().mockReturnValue(['count-rule']),
    findActiveRules: jest.fn().mockResolvedValue([]),
    requireManualRule: jest.fn(),
  }
  const batchExecution = { submit: jest.fn(), reconcile: jest.fn() }
  const eventEmitter = { emit: jest.fn(), emitAsync: jest.fn().mockResolvedValue([]) }
  const service = new C2cAutomaticPaymentService(
    store as never,
    merchantPayments as never,
    paymentOrders as never,
    payments as never,
    batchService as never,
    batchPolicies as never,
    batchExecution as never,
    eventEmitter as never,
  )

  beforeEach(() => jest.clearAllMocks())

  it('creates and immediately submits an eligible instant order through the merchant payment flow', async () => {
    store.findCandidates.mockResolvedValue([candidate])
    merchantPayments.create.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.COMPLETED,
    })

    await expect(service.createAndSubmit(now)).resolves.toEqual({
      found: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(store.findCandidates).toHaveBeenCalledWith(now, 100)
    expect(merchantPayments.create).toHaveBeenCalledWith(
      'tenant-1',
      'merchant-1',
      'merchant-order-1',
      true,
    )
    expect(eventEmitter.emit).not.toHaveBeenCalled()
  })

  it('publishes every automatically created batch payment order', async () => {
    store.findCandidates.mockResolvedValue([candidate])
    merchantPayments.create.mockResolvedValue({
      id: 'payment-1',
      paymentNo: 'PAY-1',
      sourceBusinessNo: 'ORDER-1',
      status: PaymentOrderStatus.READY,
      upstreamId: null,
      lastError: null,
    })

    await service.createAndSubmit(now)

    expect(eventEmitter.emit).toHaveBeenCalledWith(
      EVENT_KEYS.TELEGRAM_PAYMENT_STATUS,
      expect.objectContaining({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        paymentOrderId: 'payment-1',
        status: PaymentOrderStatus.READY,
      }),
    )
  })

  it('rematches a pending configuration and submits it without creating a second payment order', async () => {
    store.findCandidates.mockResolvedValue([
      {
        ...candidate,
        paymentOrderId: 'payment-1',
        paymentOrderStatus: PaymentOrderStatus.PENDING_CONFIG,
        paymentOrderExecutionMode: PaymentExecutionMode.INSTANT,
      },
    ])
    paymentOrders.rematch.mockResolvedValue({
      id: 'payment-1',
      status: PaymentOrderStatus.READY,
      executionMode: PaymentExecutionMode.INSTANT,
    })

    await service.createAndSubmit(now)

    expect(merchantPayments.create).not.toHaveBeenCalled()
    expect(paymentOrders.rematch).toHaveBeenCalledWith('tenant-1', 'payment-1', true)
    expect(payments.submit).toHaveBeenCalledWith('tenant-1', 'payment-1')
  })

  it('groups and submits ready batch orders automatically', async () => {
    store.findBatchScopes.mockResolvedValue([{ tenantId: 'tenant-1', merchantId: 'merchant-1' }])
    batchService.findReadyGroups.mockResolvedValue([
      {
        batchPolicyId: 'policy-1',
        currency: 'CNY',
        merchantId: 'merchant-1',
        oldestReadyAt: new Date('2026-09-13T01:59:00.000Z'),
        paymentAccountChannelId: 'channel-1',
        paymentAccountId: 'account-1',
        paymentOrderIds: ['payment-1', 'payment-2'],
        totalAmount: '30.00',
      },
    ])
    batchService.create.mockResolvedValue({ batch: { id: 'batch-1' }, items: [] })
    batchExecution.submit.mockResolvedValue({ batchNo: 'BAT-1', status: 'PROCESSING' })

    await expect(service.submitReadyBatches(now)).resolves.toEqual({
      found: 1,
      succeeded: 1,
      failed: 0,
    })
    expect(batchService.create).toHaveBeenCalledWith('tenant-1', ['payment-1', 'payment-2'], {
      ruleIds: ['count-rule'],
      source: 'AUTOMATIC',
    })
    expect(batchExecution.submit).toHaveBeenCalledWith('tenant-1', 'batch-1')
    expect(eventEmitter.emitAsync).toHaveBeenCalledWith(
      EVENT_KEYS.TELEGRAM_BATCH_SUBMITTED,
      expect.objectContaining({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        totalCount: 2,
        totalAmount: '30.00',
        groups: 1,
        submitted: 1,
        failed: 0,
      }),
    )
    expect(batchExecution.reconcile).not.toHaveBeenCalled()
  })

  it('manually submits a global policy in isolated merchant groups', async () => {
    batchService.findReadyGroups.mockResolvedValue([
      {
        batchPolicyId: 'policy-1',
        currency: 'CNY',
        merchantId: 'merchant-1',
        oldestReadyAt: now,
        paymentAccountChannelId: 'channel-1',
        paymentAccountId: 'account-1',
        paymentOrderIds: ['payment-1'],
        totalAmount: '10.00',
      },
      {
        batchPolicyId: 'policy-1',
        currency: 'CNY',
        merchantId: 'merchant-2',
        oldestReadyAt: now,
        paymentAccountChannelId: 'channel-2',
        paymentAccountId: 'account-2',
        paymentOrderIds: ['payment-2'],
        totalAmount: '20.00',
      },
    ])
    batchService.create
      .mockResolvedValueOnce({ batch: { id: 'batch-1' }, items: [] })
      .mockResolvedValueOnce({ batch: { id: 'batch-2' }, items: [] })

    await expect(service.submitPolicyManually('tenant-1', 'policy-1', null)).resolves.toEqual({
      found: 2,
      succeeded: 2,
      failed: 0,
    })

    expect(batchPolicies.requireManualRule).toHaveBeenCalledWith('tenant-1', null, 'policy-1')
    expect(batchService.findReadyGroups).toHaveBeenCalledWith('tenant-1', null, 'policy-1')
    expect(batchService.create).toHaveBeenNthCalledWith(1, 'tenant-1', ['payment-1'], {
      ruleIds: [],
      source: 'MANUAL',
    })
    expect(batchService.create).toHaveBeenNthCalledWith(2, 'tenant-1', ['payment-2'], {
      ruleIds: [],
      source: 'MANUAL',
    })
  })

  it('reconciles uncertain payments from every source and only retries platform confirmation after funds succeeded', async () => {
    store.findRecoverablePayments.mockResolvedValue([
      {
        id: 'payment-1',
        tenantId: 'tenant-1',
        sourceType: PaymentSourceType.BOT_MANUAL,
        status: PaymentOrderStatus.UNKNOWN,
        upstreamId: null,
      },
      {
        id: 'payment-2',
        tenantId: 'tenant-1',
        status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
        upstreamId: 'alipay-2',
      },
    ])

    await service.recover()

    expect(payments.reconcile).toHaveBeenCalledWith('tenant-1', 'payment-1')
    expect(payments.confirmPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'payment-2',
        status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
      }),
    )
    expect(payments.submit).not.toHaveBeenCalled()
  })

  it('submits a ready batch left behind by a failed preflight and reconciles active batches', async () => {
    store.findRecoverableBatches.mockResolvedValue([
      { id: 'batch-ready', tenantId: 'tenant-1', status: PaymentBatchStatus.READY },
      { id: 'batch-processing', tenantId: 'tenant-1', status: PaymentBatchStatus.PROCESSING },
    ])

    await service.recover()

    expect(batchExecution.submit).toHaveBeenCalledWith('tenant-1', 'batch-ready')
    expect(batchExecution.reconcile).toHaveBeenCalledWith('tenant-1', 'batch-processing')
  })
})
