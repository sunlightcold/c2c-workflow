import { Test } from '@nestjs/testing'
import { AlipayBatchAdapter } from './alipay-batch.adapter'
import { AlipayMerchantTransferAdapter } from './alipay-merchant-transfer.adapter'
import { ALIPAY_GATEWAY, PaymentExecutionStatus } from './payment-adapter.types'

describe('Alipay payment adapters', () => {
  const gateway = { execute: jest.fn() }
  let batch: AlipayBatchAdapter
  let transfer: AlipayMerchantTransferAdapter

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        AlipayBatchAdapter,
        AlipayMerchantTransferAdapter,
        { provide: ALIPAY_GATEWAY, useValue: gateway },
      ],
    }).compile()
    batch = module.get(AlipayBatchAdapter)
    transfer = module.get(AlipayMerchantTransferAdapter)
  })

  it('creates a password-protected batch with the fixed Alipay product and scene', async () => {
    gateway.execute.mockResolvedValue({
      code: '10000',
      outBatchNo: 'B20260910001',
      batchTransId: 'A1',
      status: 'WAIT_PAY',
    })
    await expect(
      batch.create({
        batchNo: 'B20260910001',
        items: [
          { businessNo: 'P1', amount: '10.20', payeeIdentity: 'a@example.com', payeeName: '张三' },
          { businessNo: 'P2', amount: '2.30', payeeIdentity: 'b@example.com', payeeName: '李四' },
        ],
      }),
    ).resolves.toMatchObject({ status: PaymentExecutionStatus.PROCESSING, upstreamId: 'A1' })
    expect(gateway.execute).toHaveBeenCalledWith(
      'alipay.fund.batch.create',
      expect.objectContaining({
        product_code: 'BATCH_PAY_V2',
        biz_scene: 'MESSAGE_BATCH_PAY',
        total_trans_amount: '12.50',
        total_count: '2',
      }),
    )
  })

  it('keeps PART_SUCCESS processing until every batch detail is final', async () => {
    gateway.execute.mockResolvedValue({
      code: '10000',
      outBatchNo: 'B1',
      batchTransId: 'A1',
      batchStatus: 'PART_SUCCESS',
      totalAmount: '12.50',
      accDetailList: [],
    })
    await expect(batch.query('B1')).resolves.toMatchObject({
      status: PaymentExecutionStatus.PROCESSING,
    })
  })

  it('uses the official merchant transfer create and query methods', async () => {
    gateway.execute
      .mockResolvedValueOnce({ code: '10000', outBizNo: 'P1', orderId: 'A1', status: 'DEALING' })
      .mockResolvedValueOnce({
        code: '10000',
        outBizNo: 'P1',
        orderId: 'A1',
        status: 'SUCCESS',
        transAmount: '10.20',
      })

    await expect(
      transfer.create({
        businessNo: 'P1',
        amount: '10.20',
        payeeIdentity: 'a@example.com',
        payeeName: '张三',
      }),
    ).resolves.toMatchObject({ status: PaymentExecutionStatus.PROCESSING })
    await expect(transfer.query('P1')).resolves.toMatchObject({
      status: PaymentExecutionStatus.SUCCESS,
    })
    expect(gateway.execute.mock.calls.map(([method]) => method)).toEqual([
      'alipay.fund.trans.uni.transfer',
      'alipay.fund.trans.common.query',
    ])
  })

  it('keeps non-terminal merchant transfer query errors unknown', async () => {
    gateway.execute.mockResolvedValue({
      code: '40004',
      subCode: 'isv.insufficient-isv-permissions',
      subMsg: 'Insufficient permissions',
    })

    await expect(transfer.query('P1')).resolves.toMatchObject({
      status: PaymentExecutionStatus.UNKNOWN,
      errorMessage: 'Insufficient permissions',
    })
  })
})
