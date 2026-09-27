import { PaymentSourceType } from '@admin/database'
import { PaymentExecutionStatus } from './payment-adapter.types'
import { PaymentPreflightRejectionError } from './c2c-payment-preflight-verifier'
import {
  PaymentBatchExecutionCoordinator,
  type ExecutablePaymentBatch,
} from './payment-batch-execution-coordinator'
import { PaymentBatchStatus } from '@admin/database'
import { PaymentNotSubmittedError } from './payment-execution.errors'
import { PaymentBatchClaimRejectionError } from './payment-execution.errors'
import { Logger } from '@nestjs/common'

describe('PaymentBatchExecutionCoordinator', () => {
  const batch: ExecutablePaymentBatch = {
    id: 'batch-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    batchNo: 'BAT-1',
    status: PaymentBatchStatus.READY,
    credentialRef: 'secret://alipay/account-1',
    reconciliationAttempts: 0,
    nextReconcileAt: null,
    items: [
      {
        id: 'item-1',
        paymentOrderId: 'order-1',
        paymentNo: 'PAY-1',
        sourceBusinessNo: 'platform-order-1',
        sourceType: PaymentSourceType.C2C_BUY,
        amount: '10.00',
        payeeIdentity: 'payee@example.com',
        payeeName: 'Payee',
      },
    ],
  }
  const store = {
    prepare: jest.fn(),
    claim: jest.fn(),
    pruneReadyItems: jest.fn(),
    markSubmitted: jest.fn(),
    markUnknown: jest.fn(),
    recordReconciliationPending: jest.fn(),
    fail: jest.fn(),
    applyQuery: jest.fn(),
    runLocked: jest.fn(),
  }
  const executor = {
    submit: jest.fn(),
    query: jest.fn(),
    getReconciliationPolicy: jest.fn().mockReturnValue({
      enabled: true,
      initialDelaySeconds: 10,
      intervalSeconds: 5,
      maxAttempts: 12,
    }),
  }
  const preflight = { verifyBatch: jest.fn() }
  const payments = { confirmPlatform: jest.fn() }
  const eventEmitter = { emit: jest.fn() }
  let coordinator: PaymentBatchExecutionCoordinator

  beforeEach(() => {
    jest.clearAllMocks()
    store.prepare.mockResolvedValue(batch)
    store.claim.mockImplementation(async (input) => ({
      ...input,
      status: PaymentBatchStatus.SUBMITTING,
    }))
    store.pruneReadyItems.mockImplementation(async (input) => input)
    store.markSubmitted.mockImplementation(async (input, status) => ({ ...input, status }))
    store.markUnknown.mockResolvedValue({ ...batch, status: PaymentBatchStatus.UNKNOWN })
    store.recordReconciliationPending.mockImplementation(async (current, _message, schedule) => ({
      ...current,
      ...schedule,
    }))
    store.fail.mockResolvedValue({ ...batch, status: PaymentBatchStatus.FAILED })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.SUCCESS },
      paymentsToConfirm: [{ id: 'order-1', tenantId: 'tenant-1', status: 'SUCCESS' }],
    })
    payments.confirmPlatform.mockResolvedValue({ status: 'COMPLETED' })
    store.runLocked.mockImplementation(async (_key, work) => work())
    coordinator = new PaymentBatchExecutionCoordinator(
      store,
      executor,
      preflight,
      payments,
      eventEmitter as never,
    )
  })

  afterEach(() => jest.restoreAllMocks())

  it('preflights and submits once without immediately querying the batch', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })
    expect(preflight.verifyBatch).toHaveBeenCalledWith('tenant-1', 'order-1')
    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(executor.getReconciliationPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ batchNo: 'BAT-1' }),
    )
    expect(store.markSubmitted).toHaveBeenCalledWith(
      expect.objectContaining({ batchNo: 'BAT-1' }),
      PaymentBatchStatus.PROCESSING,
      undefined,
      expect.objectContaining({ reconciliationAttempts: 0, nextReconcileAt: expect.any(Date) }),
    )
    expect(executor.query).not.toHaveBeenCalled()
    expect(payments.confirmPlatform).not.toHaveBeenCalled()
  })

  it('removes a terminally cancelled order and still submits the valid batch items', async () => {
    const mixedBatch: ExecutablePaymentBatch = {
      ...batch,
      items: [
        ...batch.items,
        {
          id: 'item-2',
          paymentOrderId: 'order-2',
          paymentNo: 'PAY-2',
          sourceBusinessNo: 'platform-order-2',
          sourceType: PaymentSourceType.C2C_BUY,
          amount: '20.00',
          payeeIdentity: 'second@example.com',
          payeeName: 'Second',
        },
      ],
    }
    store.prepare.mockResolvedValue(mixedBatch)
    store.pruneReadyItems.mockResolvedValue({
      ...mixedBatch,
      items: [mixedBatch.items[1]],
    })
    preflight.verifyBatch
      .mockRejectedValueOnce(
        new PaymentPreflightRejectionError('商家订单状态不允许执行当前支付方式', true),
      )
      .mockResolvedValueOnce(undefined)
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
      preflightSkippedCount: 1,
    })
    expect(store.pruneReadyItems).toHaveBeenCalledWith(mixedBatch, [
      {
        paymentOrderId: 'order-1',
        reason: '商家订单状态不允许执行当前支付方式',
      },
    ])
    expect(store.claim).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ paymentOrderId: 'order-2' })],
        preflightSkippedCount: 1,
      }),
    )
    expect(executor.submit).toHaveBeenCalledTimes(1)
  })

  it('recovers when an order is cancelled after preflight but before claim', async () => {
    const mixedBatch: ExecutablePaymentBatch = {
      ...batch,
      items: [
        ...batch.items,
        {
          id: 'item-2',
          paymentOrderId: 'order-2',
          paymentNo: 'PAY-2',
          sourceBusinessNo: 'platform-order-2',
          sourceType: PaymentSourceType.C2C_BUY,
          amount: '20.00',
          payeeIdentity: 'second@example.com',
          payeeName: 'Second',
        },
      ],
    }
    store.prepare.mockReset()
    store.prepare.mockResolvedValueOnce(mixedBatch).mockResolvedValueOnce(mixedBatch)
    store.claim
      .mockRejectedValueOnce(
        new PaymentBatchClaimRejectionError('商家订单已不可进入批量支付处理', 'order-1'),
      )
      .mockImplementationOnce(async (input) => ({
        ...input,
        status: PaymentBatchStatus.SUBMITTING,
      }))
    store.pruneReadyItems.mockResolvedValueOnce({
      ...mixedBatch,
      items: [mixedBatch.items[1]],
    })
    preflight.verifyBatch
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(
        new PaymentPreflightRejectionError('商家订单状态不允许执行当前支付方式', true),
      )
      .mockResolvedValueOnce(undefined)
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
      preflightSkippedCount: 1,
    })
    expect(store.pruneReadyItems).toHaveBeenCalledWith(mixedBatch, [
      {
        paymentOrderId: 'order-1',
        reason: '商家订单状态不允许执行当前支付方式',
      },
    ])
    expect(store.claim).toHaveBeenCalledTimes(2)
    expect(executor.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ paymentOrderId: 'order-2' })],
      }),
    )
  })

  it('continues when cancellation already removed the rejected item before pruning', async () => {
    const mixedBatch: ExecutablePaymentBatch = {
      ...batch,
      items: [
        ...batch.items,
        {
          id: 'item-2',
          paymentOrderId: 'order-2',
          paymentNo: 'PAY-2',
          sourceBusinessNo: 'platform-order-2',
          sourceType: PaymentSourceType.C2C_BUY,
          amount: '20.00',
          payeeIdentity: 'second@example.com',
          payeeName: 'Second',
        },
      ],
    }
    const remainingBatch: ExecutablePaymentBatch = {
      ...mixedBatch,
      items: [mixedBatch.items[1]],
    }
    store.prepare.mockReset()
    store.prepare.mockResolvedValueOnce(mixedBatch).mockResolvedValueOnce(remainingBatch)
    store.claim
      .mockRejectedValueOnce(
        new PaymentBatchClaimRejectionError('商家订单已不可进入批量支付处理', 'order-1'),
      )
      .mockImplementationOnce(async (input) => ({
        ...input,
        status: PaymentBatchStatus.SUBMITTING,
      }))
    preflight.verifyBatch.mockResolvedValue(undefined)
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })

    expect(store.pruneReadyItems).not.toHaveBeenCalled()
    expect(store.claim).toHaveBeenLastCalledWith(
      expect.objectContaining({
        items: [expect.objectContaining({ paymentOrderId: 'order-2' })],
      }),
    )
    expect(executor.submit).toHaveBeenCalledTimes(1)
  })

  it('prunes a terminal PaymentNotSubmittedError returned by preflight loading', async () => {
    preflight.verifyBatch.mockRejectedValue(
      new PaymentNotSubmittedError('支付订单关联的商家订单不存在', true),
    )
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
      preflightSkippedCount: 1,
    })

    expect(store.pruneReadyItems).toHaveBeenCalledWith(batch, [
      { paymentOrderId: 'order-1', reason: '支付订单关联的商家订单不存在' },
    ])
    expect(executor.submit).toHaveBeenCalledTimes(1)
  })

  it('logs the batch and all item relationship identifiers', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
    executor.submit.mockResolvedValue({
      status: PaymentExecutionStatus.PROCESSING,
      upstreamId: 'alipay-batch-1',
      raw: {},
    })

    await coordinator.submit('tenant-1', 'batch-1')

    const messages = log.mock.calls.map(([message]) => String(message)).join('\n')
    expect(messages).toContain('tenantId=tenant-1')
    expect(messages).toContain('merchantId=merchant-1')
    expect(messages).toContain('batchId=batch-1')
    expect(messages).toContain('batchNo=BAT-1')
    expect(messages).toContain('batchUpstreamId=alipay-batch-1')
    expect(messages).toContain('order-1/PAY-1/platform-order-1/none')
  })

  it('starts the initial delay after the upstream submission response', async () => {
    let responseCompleted = false
    const now = jest
      .spyOn(Date, 'now')
      .mockImplementation(() => (responseCompleted ? 20_000 : 1_000))
    executor.submit.mockImplementation(async () => {
      responseCompleted = true
      return { status: PaymentExecutionStatus.PROCESSING, raw: {} }
    })

    await coordinator.submit('tenant-1', 'batch-1')

    expect(store.markSubmitted).toHaveBeenCalledWith(
      expect.any(Object),
      PaymentBatchStatus.PROCESSING,
      undefined,
      { reconciliationAttempts: 0, nextReconcileAt: new Date(30_000) },
    )
    now.mockRestore()
  })

  it('keeps a transport failure unknown and never resubmits it during reconciliation', async () => {
    executor.submit.mockRejectedValue(new Error('timeout'))

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.UNKNOWN,
    })
    expect(executor.query).not.toHaveBeenCalled()

    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.UNKNOWN })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.PROCESSING },
      paymentsToConfirm: [],
    })
    await coordinator.reconcile('tenant-1', 'batch-1')

    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(executor.query).toHaveBeenCalledTimes(1)
    expect(store.applyQuery).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.UNKNOWN }),
      expect.objectContaining({ status: PaymentExecutionStatus.PROCESSING }),
      expect.objectContaining({ reconciliationAttempts: 1, nextReconcileAt: expect.any(Date) }),
    )
  })

  it('recovers a batch submission interrupted before its local status was advanced', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.SUBMITTING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.PROCESSING },
      paymentsToConfirm: [],
    })

    await expect(coordinator.reconcile('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })
    expect(executor.submit).not.toHaveBeenCalled()
    expect(executor.query).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.SUBMITTING }),
    )
  })

  it('ends fast reconciliation after the channel attempt limit', async () => {
    store.prepare.mockResolvedValue({
      ...batch,
      status: PaymentBatchStatus.PROCESSING,
      reconciliationAttempts: 11,
    })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await coordinator.reconcile('tenant-1', 'batch-1')

    expect(store.applyQuery).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      reconciliationAttempts: 12,
      nextReconcileAt: null,
    })
  })

  it('keeps processing status when an automatic query returns an unknown result', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({
      status: PaymentExecutionStatus.UNKNOWN,
      errorMessage: 'upstream result unavailable',
      raw: {},
    })

    await expect(coordinator.reconcile('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })

    expect(store.recordReconciliationPending).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.PROCESSING }),
      'upstream result unavailable',
      expect.objectContaining({ reconciliationAttempts: 1 }),
    )
    expect(store.markUnknown).not.toHaveBeenCalled()
    expect(store.applyQuery).not.toHaveBeenCalled()
  })

  it('keeps processing status when an automatic query throws', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockRejectedValue(new Error('query timeout'))

    await expect(coordinator.reconcile('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })

    expect(store.recordReconciliationPending).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.PROCESSING }),
      'query timeout',
      expect.objectContaining({ reconciliationAttempts: 1 }),
    )
    expect(store.markUnknown).not.toHaveBeenCalled()
  })

  it('fails without querying when the request was definitely not submitted', async () => {
    executor.submit.mockRejectedValue(new PaymentNotSubmittedError('支付宝凭据无效'))

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.FAILED,
    })
    expect(store.fail).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.SUBMITTING }),
      '支付宝凭据无效',
    )
    expect(executor.query).not.toHaveBeenCalled()
  })

  it('keeps the batch processing when returned details cannot be safely matched', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })
    store.applyQuery.mockRejectedValue(new Error('支付宝批次包含未知支付明细'))

    await expect(coordinator.reconcile('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.PROCESSING,
    })
    expect(store.recordReconciliationPending).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.PROCESSING }),
      '支付宝批次包含未知支付明细',
      expect.objectContaining({ reconciliationAttempts: 1 }),
    )
    expect(store.markUnknown).not.toHaveBeenCalled()
  })

  it('rechecks the reconciliation schedule after acquiring the batch lock', async () => {
    store.prepare.mockResolvedValue({
      ...batch,
      status: PaymentBatchStatus.PROCESSING,
      nextReconcileAt: new Date(Date.now() + 60_000),
    })

    await expect(
      coordinator.reconcile('tenant-1', 'batch-1', {
        respectSchedule: true,
        skipIfBusy: true,
      }),
    ).resolves.toBeUndefined()

    expect(executor.query).not.toHaveBeenCalled()
  })

  it('recovers an active batch whose schedule was cleared by the previous attempt limit', async () => {
    store.prepare.mockResolvedValue({
      ...batch,
      status: PaymentBatchStatus.PROCESSING,
      reconciliationAttempts: 12,
      nextReconcileAt: null,
    })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await coordinator.reconcile('tenant-1', 'batch-1', {
      respectSchedule: true,
      skipIfBusy: true,
    })

    expect(executor.query).toHaveBeenCalledTimes(1)
    expect(store.applyQuery).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), {
      reconciliationAttempts: 13,
      nextReconcileAt: null,
    })
  })

  it('serializes submit and reconciliation with the same batch operation lock', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })

    await coordinator.submit('tenant-1', 'batch-1')
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })
    await coordinator.reconcile('tenant-1', 'batch-1')
    await coordinator.queryUpstream('tenant-1', 'batch-1')

    expect(store.runLocked).toHaveBeenNthCalledWith(
      1,
      'payment-batch:tenant-1:batch-1',
      expect.any(Function),
    )
    expect(store.runLocked).toHaveBeenNthCalledWith(
      2,
      'payment-batch:tenant-1:batch-1',
      expect.any(Function),
    )
    expect(store.runLocked).toHaveBeenNthCalledWith(
      3,
      'payment-batch:tenant-1:batch-1',
      expect.any(Function),
    )
  })

  it('suppresses child failure alerts and emits one aggregate platform-confirmation result', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.SUCCESS },
      paymentsToConfirm: [
        {
          id: 'order-1',
          tenantId: 'tenant-1',
          merchantId: 'merchant-1',
          sourceBusinessNo: 'C2C-1',
          amount: '10.00',
          currency: 'CNY',
          status: 'SUCCESS',
        },
      ],
    })
    payments.confirmPlatform.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      sourceBusinessNo: 'C2C-1',
      amount: '10.00',
      currency: 'CNY',
      status: 'PLATFORM_CONFIRM_PENDING',
      lastError: '平台尚未确认已付款',
    })

    await coordinator.reconcile('tenant-1', 'batch-1')

    expect(payments.confirmPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      { suppressFailureNotification: true },
    )
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'telegram.batch-platform-confirmation.result',
      expect.objectContaining({
        batchNo: 'BAT-1',
        items: [expect.objectContaining({ sourceBusinessNo: 'C2C-1', success: false })],
      }),
    )
  })

  it('emits the terminal batch result before starting platform confirmation', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.SUCCESS },
      paymentsToConfirm: [
        {
          id: 'order-1',
          tenantId: 'tenant-1',
          merchantId: 'merchant-1',
          sourceBusinessNo: 'C2C-1',
          amount: '10.00',
          currency: 'CNY',
          status: 'SUCCESS',
        },
      ],
    })
    payments.confirmPlatform.mockResolvedValue({
      id: 'order-1',
      platformConfirmStatus: 'SUCCESS',
    })

    await coordinator.reconcile('tenant-1', 'batch-1')

    const terminalBatchEvent = eventEmitter.emit.mock.calls.findIndex(
      ([event, payload]) =>
        event === 'telegram.batch.status' && payload.status === PaymentBatchStatus.SUCCESS,
    )
    expect(terminalBatchEvent).toBeGreaterThanOrEqual(0)
    expect(eventEmitter.emit.mock.invocationCallOrder[terminalBatchEvent]).toBeLessThan(
      payments.confirmPlatform.mock.invocationCallOrder[0],
    )
  })

  it('queues every successful batch item for its platform time slot without waiting for the first', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.SUCCESS },
      paymentsToConfirm: [
        { id: 'order-1', tenantId: 'tenant-1', status: 'SUCCESS' },
        { id: 'order-2', tenantId: 'tenant-1', status: 'SUCCESS' },
      ],
    })
    let finishFirst!: () => void
    const firstPending = new Promise<void>((resolve) => {
      finishFirst = resolve
    })
    payments.confirmPlatform
      .mockImplementationOnce(async (payment) => {
        await firstPending
        return payment
      })
      .mockImplementationOnce(async (payment) => payment)

    const reconciliation = coordinator.reconcile('tenant-1', 'batch-1')
    await new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
    const startedBeforeFirstCompleted = payments.confirmPlatform.mock.calls.length
    finishFirst()
    await reconciliation

    expect(startedBeforeFirstCompleted).toBe(2)
    expect(payments.confirmPlatform).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'batch-1',
        batchNo: 'BAT-1',
      }),
      { suppressFailureNotification: true },
    )
  })
})
