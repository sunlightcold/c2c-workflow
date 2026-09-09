import { PaymentOrderEntity, PaymentOrderStatusHistoryEntity } from '@admin/database'
import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, type EntityManager } from 'typeorm'
import type { ExecutablePaymentOrder, PaymentOrderStore } from './payment-execution-coordinator'
import { assertPaymentOrderTransition, PaymentOrderState } from './payment-order-state-machine'

@Injectable()
export class TypeOrmPaymentOrderStore implements PaymentOrderStore {
  constructor(private readonly dataSource: DataSource) {}

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

  private toExecutable(order: PaymentOrderEntity): ExecutablePaymentOrder {
    return {
      id: order.id,
      tenantId: order.tenantId,
      status: order.status,
      upstreamId: order.upstreamId,
    }
  }
}
