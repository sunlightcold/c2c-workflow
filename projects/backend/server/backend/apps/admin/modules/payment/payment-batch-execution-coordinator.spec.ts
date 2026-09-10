import { PaymentSourceType } from '@admin/database'
import { PaymentExecutionStatus } from './payment-adapter.types'
import {
  PaymentBatchExecutionCoordinator,
  type ExecutablePaymentBatch,
} from './payment-batch-execution-coordinator'
import { PaymentBatchStatus } from '@admin/database'
import { PaymentNotSubmittedError } from './payment-execution.errors'

describe('PaymentBatchExecutionCoordinator', () => {
  const batch: ExecutablePaymentBatch = {
    id: 'batch-1',
    tenantId: 'tenant-1',
    batchNo: 'BAT-1',
    status: PaymentBatchStatus.READY,
    credentialRef: 'secret://alipay/account-1',
    items: [
      {
        id: 'item-1',
        paymentOrderId: 'order-1',
        paymentNo: 'PAY-1',
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
    markSubmitted: jest.fn(),
    markUnknown: jest.fn(),
    fail: jest.fn(),
    applyQuery: jest.fn(),
  }
  const executor = { submit: jest.fn(), query: jest.fn() }
  const preflight = { verifyBatch: jest.fn() }
  const payments = { confirmPlatform: jest.fn() }
  let coordinator: PaymentBatchExecutionCoordinator

  beforeEach(() => {
    jest.clearAllMocks()
    store.prepare.mockResolvedValue(batch)
    store.claim.mockResolvedValue({ ...batch, status: PaymentBatchStatus.SUBMITTING })
    store.markSubmitted.mockImplementation(async (_batch, status) => ({ ...batch, status }))
    store.markUnknown.mockResolvedValue({ ...batch, status: PaymentBatchStatus.UNKNOWN })
    store.fail.mockResolvedValue({ ...batch, status: PaymentBatchStatus.FAILED })
    store.applyQuery.mockResolvedValue({
      batch: { ...batch, status: PaymentBatchStatus.SUCCESS },
      paymentsToConfirm: [{ id: 'order-1', tenantId: 'tenant-1', status: 'SUCCESS' }],
    })
    payments.confirmPlatform.mockResolvedValue({ status: 'COMPLETED' })
    coordinator = new PaymentBatchExecutionCoordinator(store, executor, preflight, payments)
  })

  it('preflights C2C items, submits once, queries the original batch, and confirms successful payments', async () => {
    executor.submit.mockResolvedValue({ status: PaymentExecutionStatus.PROCESSING, raw: {} })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })

    await expect(coordinator.submit('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.SUCCESS,
    })
    expect(preflight.verifyBatch).toHaveBeenCalledWith('tenant-1', 'order-1')
    expect(executor.submit).toHaveBeenCalledTimes(1)
    expect(executor.query).toHaveBeenCalledWith(
      expect.objectContaining({ batchNo: 'BAT-1', status: PaymentBatchStatus.PROCESSING }),
    )
    expect(payments.confirmPlatform).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1', status: 'SUCCESS' }),
    )
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

  it('keeps the batch unknown when returned details cannot be safely matched', async () => {
    store.prepare.mockResolvedValue({ ...batch, status: PaymentBatchStatus.PROCESSING })
    executor.query.mockResolvedValue({ status: PaymentExecutionStatus.SUCCESS, raw: {} })
    store.applyQuery.mockRejectedValue(new Error('支付宝批次包含未知支付明细'))

    await expect(coordinator.reconcile('tenant-1', 'batch-1')).resolves.toMatchObject({
      status: PaymentBatchStatus.UNKNOWN,
    })
    expect(store.markUnknown).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentBatchStatus.PROCESSING }),
      '支付宝批次包含未知支付明细',
    )
  })
})
