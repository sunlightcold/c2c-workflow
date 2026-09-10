import { PaymentBatchStatus, PaymentSourceType } from '@admin/database'
import { PaymentExecutionStatus } from './payment-adapter.types'
import { AlipayBatchPaymentExecutor } from './alipay-batch-payment.executor'
import { PaymentNotSubmittedError } from './payment-execution.errors'

describe('AlipayBatchPaymentExecutor', () => {
  const batch = {
    id: 'batch-1',
    tenantId: 'tenant-1',
    batchNo: 'BAT-1',
    status: PaymentBatchStatus.SUBMITTING,
    credentialRef: 'secret://alipay/account-1',
    items: [
      {
        id: 'item-1',
        paymentOrderId: 'order-1',
        paymentNo: 'PAY-1',
        sourceType: PaymentSourceType.BOT_MANUAL,
        amount: '10.00',
        payeeIdentity: 'payee@example.com',
        payeeName: 'Payee',
      },
    ],
  }
  const gateway = { execute: jest.fn() }
  const gateways = { create: jest.fn() }
  let executor: AlipayBatchPaymentExecutor

  beforeEach(() => {
    jest.clearAllMocks()
    gateways.create.mockResolvedValue(gateway)
    executor = new AlipayBatchPaymentExecutor(gateways)
  })

  it('uses the batch number and payment numbers as stable Alipay idempotency keys', async () => {
    gateway.execute.mockResolvedValue({
      code: '10000',
      outBatchNo: 'BAT-1',
      batchTransId: 'ALI-BAT-1',
      status: 'DEALING',
    })

    await expect(executor.submit(batch)).resolves.toMatchObject({
      status: PaymentExecutionStatus.PROCESSING,
      upstreamId: 'ALI-BAT-1',
    })
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.batch.create',
      expect.objectContaining({
        out_batch_no: 'BAT-1',
        trans_order_list: [expect.objectContaining({ out_biz_no: 'PAY-1' })],
      }),
    )
  })

  it('classifies credential resolution failure as definitely not submitted', async () => {
    gateways.create.mockRejectedValue(new Error('Secret missing'))

    await expect(executor.submit(batch)).rejects.toEqual(
      new PaymentNotSubmittedError('Secret missing'),
    )
    expect(gateway.execute).not.toHaveBeenCalled()
  })

  it('queries with the original batch number', async () => {
    gateway.execute.mockResolvedValue({
      code: '10000',
      outBatchNo: 'BAT-1',
      batchTransId: 'ALI-BAT-1',
      batchStatus: 'DEALING',
      totalPageCount: 1,
      accDetailList: [],
    })

    await executor.query({ ...batch, status: PaymentBatchStatus.UNKNOWN })

    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.batch.detail.query',
      expect.objectContaining({ out_batch_no: 'BAT-1' }),
    )
  })
})
