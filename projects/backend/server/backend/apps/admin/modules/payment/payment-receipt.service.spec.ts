import { PaymentBatchItemStatus, PaymentExecutionMode, PaymentOrderStatus } from '@admin/database'
import { PaymentReceiptService } from './payment-receipt.service'
import { AlipayBatchAdapter } from './alipay-batch.adapter'
import { AlipayMerchantTransferAdapter } from './alipay-merchant-transfer.adapter'
import { AlipayReceiptAdapter } from './alipay-receipt.adapter'

describe('PaymentReceiptService', () => {
  const orders = { findOne: jest.fn() }
  const items = { findOne: jest.fn() }
  const batches = { findOne: jest.fn() }
  const accountQuery = {
    addSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    getOne: jest.fn(),
  }
  const accounts = { createQueryBuilder: jest.fn().mockReturnValue(accountQuery) }
  const gateway = { execute: jest.fn() }
  const channels = {
    create: jest.fn().mockResolvedValue({
      batch: new AlipayBatchAdapter(gateway),
      order: new AlipayMerchantTransferAdapter(gateway),
      receipt: new AlipayReceiptAdapter(gateway),
    }),
  }
  let service: PaymentReceiptService

  beforeEach(() => {
    jest.clearAllMocks()
    service = new PaymentReceiptService(
      orders as never,
      items as never,
      batches as never,
      accounts as never,
      channels as never,
      { pollIntervalMs: 0, maxAttempts: 3 },
    )
    accountQuery.addSelect.mockReturnValue(accountQuery)
    accountQuery.where.mockReturnValue(accountQuery)
    accountQuery.andWhere.mockReturnValue(accountQuery)
    accountQuery.getOne.mockResolvedValue({ id: 'account-1', credentialRef: 'secret://account-1' })
    orders.findOne.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      paymentNo: 'PAY001',
      paymentAccountId: 'account-1',
      executionMode: PaymentExecutionMode.BATCH,
      status: PaymentOrderStatus.SUCCESS,
      upstreamId: 'ALIPAY001',
    })
    items.findOne.mockResolvedValue({
      batchId: 'batch-1',
      status: PaymentBatchItemStatus.SUCCESS,
    })
    batches.findOne.mockResolvedValue({ id: 'batch-1', batchNo: 'BAT001' })
  })

  it('queries the batch detail id, polls the receipt, and returns its download URL', async () => {
    orders.findOne.mockResolvedValue({
      id: 'order-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      paymentNo: 'PAY001',
      paymentAccountId: 'account-1',
      executionMode: PaymentExecutionMode.BATCH,
      status: PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
      upstreamId: 'ALIPAY001',
    })
    gateway.execute
      .mockResolvedValueOnce({
        code: '10000',
        outBatchNo: 'BAT001',
        accDetailList: [{ outBizNo: 'PAY001', detailId: 'DETAIL001', status: 'SUCCESS' }],
      })
      .mockResolvedValueOnce({ code: '10000', fileId: 'FILE001' })
      .mockResolvedValueOnce({ code: '10000', status: 'PROCESS' })
      .mockResolvedValueOnce({
        code: '10000',
        status: 'SUCCESS',
        downloadUrl: 'https://example.test/receipt.pdf',
      })

    await expect(service.getReceipt('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      status: 'READY',
      downloadUrl: 'https://example.test/receipt.pdf',
      message: '回单已生成',
    })
    expect(gateway.execute).toHaveBeenNthCalledWith(2, 'alipay.data.bill.ereceipt.apply', {
      type: 'FUND_DETAIL',
      key: 'DETAIL001',
    })
    expect(gateway.execute).toHaveBeenLastCalledWith('alipay.data.bill.ereceipt.query', {
      file_id: 'FILE001',
    })
  })

  it('returns the upstream failure instead of claiming that the receipt exists', async () => {
    gateway.execute
      .mockResolvedValueOnce({
        code: '10000',
        outBatchNo: 'BAT001',
        accDetailList: [{ outBizNo: 'PAY001', detailId: 'DETAIL001', status: 'SUCCESS' }],
      })
      .mockResolvedValueOnce({ code: '10000', fileId: 'FILE002' })
      .mockResolvedValueOnce({ code: '10000', status: 'FAIL', errorMessage: '回单生成失败' })

    await expect(service.getReceipt('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      status: 'FAILED',
      message: '回单生成失败',
    })
  })

  it('returns a timeout result when Alipay keeps processing the receipt', async () => {
    gateway.execute
      .mockResolvedValueOnce({
        code: '10000',
        outBatchNo: 'BAT001',
        accDetailList: [{ outBizNo: 'PAY001', detailId: 'DETAIL001', status: 'SUCCESS' }],
      })
      .mockResolvedValueOnce({ code: '10000', fileId: 'FILE003' })
      .mockResolvedValue({ code: '10000', status: 'PROCESS' })

    await expect(service.getReceipt('tenant-1', 'merchant-1', 'order-1')).resolves.toEqual({
      status: 'FAILED',
      message: '回单生成超时',
    })
  })

  it('scopes payment orders and payment accounts to the tenant and merchant', async () => {
    orders.findOne.mockResolvedValue(null)

    await expect(service.getReceipt('tenant-2', 'merchant-2', 'order-1')).resolves.toEqual({
      status: 'FAILED',
      message: '未查询到支付订单，无法获取回单',
    })
    expect(orders.findOne).toHaveBeenCalledWith({
      where: { id: 'order-1', tenantId: 'tenant-2', merchantId: 'merchant-2' },
    })
    expect(channels.create).not.toHaveBeenCalled()
  })
})
