import {
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@admin/database'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import type { ExecutablePaymentOrder, PaymentOrderStore } from './payment-execution-coordinator'
import { assertPaymentOrderTransition, PaymentOrderState } from './payment-order-state-machine'

@Injectable()
export class TypeOrmPaymentOrderStore implements PaymentOrderStore {
  constructor(private readonly dataSource: DataSource) {}

  async get(tenantId: string, orderId: string): Promise<ExecutablePaymentOrder> {
    const order = await this.dataSource
      .getRepository(PaymentOrderEntity)
      .findOne({ where: { id: orderId, tenantId } })
    if (!order) throw new ConflictException('支付订单不存在或不属于当前所属单位')
    return this.toExecutable(order)
  }

  claim(tenantId: string, orderId: string): Promise<ExecutablePaymentOrder> {
    return this.dataSource.transaction(async (manager) => {
      const order = await this.updateStatus(
        manager,
        tenantId,
        orderId,
        PaymentOrderState.READY,
        PaymentOrderState.SUBMITTING,
      )
      await this.history(manager, order, PaymentOrderState.READY, PaymentOrderState.SUBMITTING)
      await this.claimMerchantOrder(manager, order)
      return this.toExecutable(order)
    })
  }

  transition(
    input: ExecutablePaymentOrder,
    next: PaymentOrderState,
    detail?: { upstreamId?: string; errorMessage?: string },
  ): Promise<ExecutablePaymentOrder> {
    assertPaymentOrderTransition(input.status, next)
    return this.dataSource.transaction(async (manager) => {
      const order = await this.updateStatus(
        manager,
        input.tenantId,
        input.id,
        input.status,
        next,
        detail,
      )
      await this.history(manager, order, input.status, next, detail?.errorMessage)
      if (next === PaymentOrderState.FAILED) {
        await this.restoreMerchantOrder(manager, order, detail?.errorMessage)
      }
      return this.toExecutable(order)
    })
  }

  private async updateStatus(
    manager: EntityManager,
    tenantId: string,
    id: string,
    current: PaymentOrderState,
    next: PaymentOrderState,
    detail?: { upstreamId?: string; errorMessage?: string },
  ) {
    const result = await manager
      .createQueryBuilder()
      .update(PaymentOrderEntity)
      .set({
        status: next,
        ...(detail?.upstreamId ? { upstreamId: detail.upstreamId } : {}),
        lastError: detail?.errorMessage ?? null,
      })
      .where('id = :id AND "tenantId" = :tenantId AND status = :current', {
        id,
        tenantId,
        current,
      })
      .returning('*')
      .execute()
    if (result.affected !== 1) throw new ConflictException('支付订单状态已变化，请刷新后重试')
    return result.raw[0] as PaymentOrderEntity
  }

  private history(
    manager: EntityManager,
    order: PaymentOrderEntity,
    from: PaymentOrderState,
    to: PaymentOrderState,
    reason?: string,
  ) {
    return manager.insert(PaymentOrderStatusHistoryEntity, {
      tenantId: order.tenantId,
      merchantId: order.merchantId,
      paymentOrderId: order.id,
      fromStatus: from,
      toStatus: to,
      source: 'PAYMENT_COORDINATOR',
      reason: reason ?? null,
    })
  }

  private async claimMerchantOrder(
    manager: EntityManager,
    paymentOrder: PaymentOrderEntity,
  ): Promise<void> {
    if (paymentOrder.sourceType !== PaymentSourceType.C2C_BUY) return
    const repository = manager.getRepository(MerchantOrderEntity)
    const merchantOrder = await repository.findOne({
      where: {
        tenantId: paymentOrder.tenantId,
        merchantId: paymentOrder.merchantId,
        platformOrderId: paymentOrder.sourceBusinessNo,
      },
      lock: { mode: 'pessimistic_write' },
    })
    if (!merchantOrder || merchantOrder.status !== MerchantOrderStatus.PENDING_PAYMENT) {
      throw new ConflictException('商家订单已不可进入支付处理')
    }
    const previous = merchantOrder.status
    merchantOrder.status = MerchantOrderStatus.PAYMENT_PROCESSING
    await repository.save(merchantOrder)
    await this.merchantHistory(
      manager,
      merchantOrder,
      previous,
      MerchantOrderStatus.PAYMENT_PROCESSING,
    )
  }

  private async restoreMerchantOrder(
    manager: EntityManager,
    paymentOrder: PaymentOrderEntity,
    reason?: string,
  ): Promise<void> {
    if (paymentOrder.sourceType !== PaymentSourceType.C2C_BUY) return
    const repository = manager.getRepository(MerchantOrderEntity)
    const merchantOrder = await repository.findOne({
      where: {
        tenantId: paymentOrder.tenantId,
        merchantId: paymentOrder.merchantId,
        platformOrderId: paymentOrder.sourceBusinessNo,
      },
      lock: { mode: 'pessimistic_write' },
    })
    if (!merchantOrder) throw new ConflictException('支付订单关联的商家订单不存在')
    if (merchantOrder.status !== MerchantOrderStatus.PAYMENT_PROCESSING) return
    const previous = merchantOrder.status
    merchantOrder.status = MerchantOrderStatus.PENDING_PAYMENT
    merchantOrder.lastError = reason ?? null
    await repository.save(merchantOrder)
    await this.merchantHistory(
      manager,
      merchantOrder,
      previous,
      MerchantOrderStatus.PENDING_PAYMENT,
      reason,
    )
  }

  private merchantHistory(
    manager: EntityManager,
    order: MerchantOrderEntity,
    from: MerchantOrderStatus,
    to: MerchantOrderStatus,
    reason?: string,
  ) {
    return manager.insert(MerchantOrderStatusHistoryEntity, {
      tenantId: order.tenantId,
      merchantId: order.merchantId,
      merchantOrderId: order.id,
      fromStatus: from,
      toStatus: to,
      source: 'PAYMENT_COORDINATOR',
      platformStatus: order.platformStatus,
      reason: reason ?? null,
    })
  }

  private toExecutable(order: PaymentOrderEntity): ExecutablePaymentOrder {
    return {
      id: order.id,
      tenantId: order.tenantId,
      status: order.status,
      upstreamId: order.upstreamId,
    }
  }
}
