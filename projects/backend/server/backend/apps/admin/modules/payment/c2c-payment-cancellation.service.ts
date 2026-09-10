import {
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@admin/database'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { DataSource, type EntityManager, In, Not } from 'typeorm'
import { sumCnyAmounts } from './payment-adapter.types'

export interface CancelC2cPaymentInput {
  merchantId: string
  merchantOrderId: string
  operator: string
  reason: string
  sourceBusinessNo: string
}

const ACTIVE_BATCH_ITEM_STATUSES = [
  PaymentBatchItemStatus.QUEUED,
  PaymentBatchItemStatus.SUBMITTING,
  PaymentBatchItemStatus.PROCESSING,
  PaymentBatchItemStatus.UNKNOWN,
]

const CANCELLABLE_PAYMENT_STATUSES = [
  PaymentOrderStatus.PENDING_CONFIG,
  PaymentOrderStatus.CREATED,
  PaymentOrderStatus.READY,
]

@Injectable()
export class C2cPaymentCancellationService {
  constructor(private readonly dataSource: DataSource) {}

  async cancel(tenantId: string, input: CancelC2cPaymentInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const paymentRepository = manager.getRepository(PaymentOrderEntity)
      const batchItemRepository = manager.getRepository(PaymentBatchItemEntity)
      const previewPayment = await paymentRepository.findOne({
        where: this.paymentScope(tenantId, input),
      })
      const previewItem = previewPayment
        ? await batchItemRepository.findOne({
            where: {
              tenantId,
              merchantId: input.merchantId,
              paymentOrderId: previewPayment.id,
              status: In(ACTIVE_BATCH_ITEM_STATUSES),
            },
          })
        : null

      const batch = previewItem
        ? await manager.getRepository(PaymentBatchEntity).findOne({
            where: { id: previewItem.batchId, tenantId, merchantId: input.merchantId },
            lock: { mode: 'pessimistic_write' },
          })
        : null
      if (previewItem && batch?.status !== PaymentBatchStatus.READY) {
        throw new ConflictException('支付批次已提交，商家订单不能作废')
      }
      const batchItem = previewItem
        ? await batchItemRepository.findOne({
            where: {
              id: previewItem.id,
              tenantId,
              merchantId: input.merchantId,
              status: PaymentBatchItemStatus.QUEUED,
            },
            lock: { mode: 'pessimistic_write' },
          })
        : null
      if (previewItem && !batchItem) throw new ConflictException('支付批次状态已变化，请刷新后重试')

      const paymentOrder = await paymentRepository.findOne({
        where: this.paymentScope(tenantId, input),
        lock: { mode: 'pessimistic_write' },
      })
      if (paymentOrder && !previewItem) {
        const activeItem = await batchItemRepository.findOne({
          where: {
            tenantId,
            merchantId: input.merchantId,
            paymentOrderId: paymentOrder.id,
            status: In(ACTIVE_BATCH_ITEM_STATUSES),
          },
        })
        if (activeItem) throw new ConflictException('支付批次状态已变化，请刷新后重试')
      }

      const merchantOrder = await manager.getRepository(MerchantOrderEntity).findOne({
        where: { id: input.merchantOrderId, tenantId, merchantId: input.merchantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!merchantOrder) throw new NotFoundException('商家订单不存在')
      if (merchantOrder.platformOrderId !== input.sourceBusinessNo) {
        throw new ConflictException('商家订单状态已变化，请刷新后重试')
      }
      const alreadyCancelled = merchantOrder.status === MerchantOrderStatus.CANCELLED
      if (!alreadyCancelled && merchantOrder.status !== MerchantOrderStatus.PENDING_PAYMENT) {
        throw new ConflictException('资金请求已提交，商家订单不能作废')
      }

      await this.cancelPayment(manager, tenantId, input, paymentOrder)
      await this.removeFromBatch(manager, tenantId, input, batch, batchItem)
      if (alreadyCancelled) return

      const previous = merchantOrder.status
      merchantOrder.status = MerchantOrderStatus.CANCELLED
      merchantOrder.lastError = null
      await manager.save(merchantOrder)
      await manager.insert(MerchantOrderStatusHistoryEntity, {
        tenantId,
        merchantId: input.merchantId,
        merchantOrderId: merchantOrder.id,
        fromStatus: previous,
        toStatus: MerchantOrderStatus.CANCELLED,
        source: 'C2C_ORDER_CANCELLATION',
        platformStatus: merchantOrder.platformStatus,
        reason: this.reason(input),
      })
    })
  }

  private async cancelPayment(
    manager: EntityManager,
    tenantId: string,
    input: CancelC2cPaymentInput,
    paymentOrder: PaymentOrderEntity | null,
  ) {
    if (!paymentOrder || paymentOrder.status === PaymentOrderStatus.CANCELLED) return
    if (!CANCELLABLE_PAYMENT_STATUSES.includes(paymentOrder.status)) {
      throw new ConflictException('资金请求已提交，商家订单不能作废')
    }
    const previous = paymentOrder.status
    paymentOrder.status = PaymentOrderStatus.CANCELLED
    paymentOrder.lastError = null
    await manager.save(paymentOrder)
    await manager.insert(PaymentOrderStatusHistoryEntity, {
      tenantId,
      merchantId: input.merchantId,
      paymentOrderId: paymentOrder.id,
      fromStatus: previous,
      toStatus: PaymentOrderStatus.CANCELLED,
      source: 'C2C_ORDER_CANCELLATION',
      reason: this.reason(input),
    })
  }

  private async removeFromBatch(
    manager: EntityManager,
    tenantId: string,
    input: CancelC2cPaymentInput,
    batch: PaymentBatchEntity | null,
    batchItem: PaymentBatchItemEntity | null,
  ) {
    if (!batch || !batchItem) return
    batchItem.status = PaymentBatchItemStatus.CANCELLED
    batchItem.errorMessage = this.reason(input)
    await manager.save(batchItem)
    const remaining = await manager.getRepository(PaymentBatchItemEntity).find({
      where: {
        batchId: batch.id,
        tenantId,
        merchantId: input.merchantId,
        status: Not(PaymentBatchItemStatus.CANCELLED),
      },
    })
    if (remaining.length > 0) {
      batch.totalCount = remaining.length
      batch.totalAmount = sumCnyAmounts(remaining.map(({ amount }) => amount))
      await manager.save(batch)
      return
    }
    const previous = batch.status
    batch.status = PaymentBatchStatus.CANCELLED
    await manager.save(batch)
    await manager.insert(PaymentBatchStatusHistoryEntity, {
      tenantId,
      merchantId: input.merchantId,
      batchId: batch.id,
      fromStatus: previous,
      toStatus: PaymentBatchStatus.CANCELLED,
      source: 'C2C_ORDER_CANCELLATION',
      reason: this.reason(input),
    })
  }

  private paymentScope(tenantId: string, input: CancelC2cPaymentInput) {
    return {
      tenantId,
      merchantId: input.merchantId,
      sourceType: PaymentSourceType.C2C_BUY,
      sourceBusinessNo: input.sourceBusinessNo,
    }
  }

  private reason(input: CancelC2cPaymentInput): string {
    return `${input.operator}: ${input.reason}`.slice(0, 512)
  }
}
