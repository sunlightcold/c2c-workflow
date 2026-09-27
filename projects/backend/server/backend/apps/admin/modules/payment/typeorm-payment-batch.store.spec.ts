import {
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentOrderStatus,
  PaymentSourceType,
} from '@admin/database'
import { PaymentExecutionStatus } from './payment-adapter.types'
import { TypeOrmPaymentBatchStore } from './typeorm-payment-batch.store'

describe('TypeOrmPaymentBatchStore amount matching', () => {
  const batch = {
    id: 'batch-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    batchNo: 'BAT-1',
    totalCount: 1,
    status: PaymentBatchStatus.PROCESSING,
    upstreamId: 'ALIPAY-BATCH-1',
    reconciliationAttempts: 0,
    nextReconcileAt: null,
  }
  const item = {
    id: 'item-1',
    paymentOrderId: 'order-1',
    amount: '56.00',
    status: PaymentBatchItemStatus.PROCESSING,
  }
  const order = {
    id: 'order-1',
    paymentNo: 'PAY-1',
    sourceType: PaymentSourceType.BOT_MANUAL,
    status: PaymentOrderStatus.PROCESSING,
  }
  const executable = {
    id: 'batch-1',
    tenantId: 'tenant-1',
    merchantId: 'merchant-1',
    batchNo: 'BAT-1',
    status: PaymentBatchStatus.PROCESSING,
    credentialRef: 'secret://alipay/account-1',
    reconciliationAttempts: 0,
    nextReconcileAt: null,
    items: [],
  }

  const manager = {
    getRepository: jest.fn(),
    save: jest.fn(async (value) => value),
    insert: jest.fn(),
  }
  const dataSource = {
    transaction: jest.fn((work) => work(manager)),
  }
  let store: TypeOrmPaymentBatchStore

  beforeEach(() => {
    jest.clearAllMocks()
    manager.getRepository.mockImplementation((entity) => {
      if (entity === PaymentBatchEntity)
        return { findOne: jest.fn().mockResolvedValue({ ...batch }) }
      if (entity === PaymentBatchItemEntity)
        return { find: jest.fn().mockResolvedValue([{ ...item }]) }
      if (entity === PaymentOrderEntity)
        return { find: jest.fn().mockResolvedValue([{ ...order }]) }
      throw new Error('Unexpected repository')
    })
    store = new TypeOrmPaymentBatchStore(dataSource as never)
  })

  it('accepts an Alipay detail with extra trailing zeros', async () => {
    await expect(store.applyQuery(executable, queryResult('56.00000000'))).resolves.toMatchObject({
      batch: { status: PaymentBatchStatus.PROCESSING },
    })
  })

  it('rejects a genuinely different Alipay detail amount', async () => {
    await expect(store.applyQuery(executable, queryResult('56.01'))).rejects.toThrow(
      '支付宝批次明细金额不匹配',
    )
  })

  it('cancels a terminal invalid item without leaving a ready batch behind', async () => {
    const readyBatch = {
      ...batch,
      status: PaymentBatchStatus.READY,
      totalCount: 1,
      totalAmount: '56.00',
    }
    const readyItem = { ...item, status: PaymentBatchItemStatus.QUEUED }
    const readyOrder = { ...order, status: PaymentOrderStatus.READY }
    manager.getRepository.mockImplementation((entity) => {
      if (entity === PaymentBatchEntity)
        return { findOne: jest.fn().mockResolvedValue({ ...readyBatch }) }
      if (entity === PaymentBatchItemEntity)
        return { find: jest.fn().mockResolvedValue([{ ...readyItem }]) }
      if (entity === PaymentOrderEntity)
        return { find: jest.fn().mockResolvedValue([{ ...readyOrder }]) }
      if (entity === PaymentBatchStatusHistoryEntity || entity === PaymentOrderStatusHistoryEntity)
        return {}
      throw new Error('Unexpected repository')
    })

    await expect(
      store.pruneReadyItems(
        {
          ...executable,
          status: PaymentBatchStatus.READY,
          items: [
            {
              ...readyItem,
              paymentNo: 'PAY-1',
              payeeIdentity: 'x',
              payeeName: 'x',
              sourceType: PaymentSourceType.BOT_MANUAL,
            },
          ],
        },
        [{ paymentOrderId: 'order-1', reason: '商家订单状态不允许执行当前支付方式' }],
      ),
    ).resolves.toMatchObject({ status: PaymentBatchStatus.CANCELLED, items: [] })
    expect(manager.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: PaymentOrderStatus.CANCELLED }),
    )
    expect(manager.insert).toHaveBeenCalledWith(
      PaymentBatchStatusHistoryEntity,
      expect.objectContaining({ toStatus: PaymentBatchStatus.CANCELLED }),
    )
  })

  function queryResult(transAmount: string) {
    return {
      status: PaymentExecutionStatus.PROCESSING,
      raw: {
        code: '10000',
        outBatchNo: 'BAT-1',
        accDetailList: [
          { outBizNo: 'PAY-1', detailId: 'DETAIL-1', status: 'DEALING' as const, transAmount },
        ],
      },
    }
  }
})
