import { randomUUID } from 'node:crypto'
import {
  BusinessStatus,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentAdapterCode,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentChannelEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentPlatformEntity,
} from '@admin/database'
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm'
import { sumCnyAmounts } from './payment-adapter.types'

export interface PaymentBatchView {
  batch: PaymentBatchEntity
  items: PaymentBatchItemEntity[]
}

@Injectable()
export class PaymentBatchService {
  constructor(private readonly dataSource: DataSource) {}

  async create(tenantId: string, paymentOrderIds: string[]): Promise<PaymentBatchView> {
    this.validateOrderIds(paymentOrderIds)
    try {
      return await this.dataSource.transaction((manager) =>
        this.createInTransaction(manager, tenantId, paymentOrderIds),
      )
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('支付订单已加入其它活动批次')
      }
      throw error
    }
  }

  private async createInTransaction(
    manager: EntityManager,
    tenantId: string,
    paymentOrderIds: string[],
  ): Promise<PaymentBatchView> {
    const orders = await manager
      .getRepository(PaymentOrderEntity)
      .createQueryBuilder('payment_order')
      .where('payment_order."tenantId" = :tenantId', { tenantId })
      .andWhere('payment_order.id IN (:...paymentOrderIds)', { paymentOrderIds })
      .orderBy('payment_order.id', 'ASC')
      .setLock('pessimistic_write')
      .getMany()
    if (orders.length !== paymentOrderIds.length)
      throw new BadRequestException('存在支付订单不存在或不属于当前所属单位')

    const first = orders[0]
    if (
      orders.some(
        (order) =>
          order.status !== PaymentOrderStatus.READY ||
          order.executionMode !== PaymentExecutionMode.BATCH ||
          order.paymentMethod !== 'ALIPAY' ||
          order.currency !== 'CNY' ||
          !order.paymentPlanId ||
          !order.paymentAccountId ||
          !order.paymentAccountChannelId,
      )
    ) {
      throw new ConflictException('只能组批待提交的支付宝批量支付订单')
    }
    if (
      orders.some(
        (order) =>
          order.merchantId !== first.merchantId ||
          order.paymentAccountId !== first.paymentAccountId ||
          order.paymentAccountChannelId !== first.paymentAccountChannelId ||
          order.currency !== first.currency,
      )
    ) {
      throw new BadRequestException('批次内支付订单的商家、支付账号、支付通道和币种必须一致')
    }

    const planIds = [...new Set(orders.map((order) => order.paymentPlanId!))]
    const [plans, account, accountChannel] = await Promise.all([
      manager.getRepository(MerchantPaymentPlanEntity).findBy({
        id: In(planIds),
        tenantId,
        merchantId: first.merchantId,
        status: BusinessStatus.ACTIVE,
      }),
      manager.getRepository(PaymentAccountEntity).findOne({
        where: {
          id: first.paymentAccountId!,
          tenantId,
          status: BusinessStatus.ACTIVE,
        },
      }),
      manager.getRepository(PaymentAccountChannelEntity).findOne({
        where: {
          id: first.paymentAccountChannelId!,
          paymentAccountId: first.paymentAccountId!,
          status: BusinessStatus.ACTIVE,
        },
      }),
    ])
    if (plans.length !== planIds.length || !account || !accountChannel)
      throw new ConflictException('支付订单锁定的批量支付配置已失效')
    if (
      plans.some(
        (plan) =>
          plan.paymentAccountId !== account.id ||
          plan.paymentAccountChannelId !== accountChannel.id,
      )
    ) {
      throw new ConflictException('支付订单锁定的批量支付方案不一致')
    }
    const [channel, platform] = await Promise.all([
      manager.getRepository(PaymentChannelEntity).findOne({
        where: { id: accountChannel.channelId, status: BusinessStatus.ACTIVE },
      }),
      manager.getRepository(PaymentPlatformEntity).findOne({
        where: { id: account.platformId, status: BusinessStatus.ACTIVE },
      }),
    ])
    if (
      !channel ||
      !platform ||
      channel.platformId !== account.platformId ||
      channel.adapterCode !== PaymentAdapterCode.ALIPAY_BATCH ||
      channel.executionMode !== PaymentExecutionMode.BATCH ||
      platform.code !== 'ALIPAY'
    ) {
      throw new ConflictException('支付账号未启用支付宝批量有密通道')
    }

    const batch = await manager.save(
      PaymentBatchEntity,
      manager.create(PaymentBatchEntity, {
        tenantId,
        merchantId: first.merchantId,
        batchNo: `BAT${randomUUID().replaceAll('-', '').toUpperCase()}`,
        paymentAccountId: account.id,
        paymentAccountChannelId: accountChannel.id,
        currency: first.currency,
        totalCount: orders.length,
        totalAmount: sumCnyAmounts(orders.map(({ amount }) => amount)),
        successCount: 0,
        failedCount: 0,
        processingCount: 0,
        unknownCount: 0,
        upstreamId: null,
        status: PaymentBatchStatus.READY,
        lastError: null,
      }),
    )
    const items = await manager.save(
      PaymentBatchItemEntity,
      orders.map((order) =>
        manager.create(PaymentBatchItemEntity, {
          tenantId,
          merchantId: order.merchantId,
          batchId: batch.id,
          paymentOrderId: order.id,
          amount: order.amount,
          status: PaymentBatchItemStatus.QUEUED,
          upstreamId: null,
          errorCode: null,
          errorMessage: null,
        }),
      ),
    )
    await manager.insert(PaymentBatchStatusHistoryEntity, {
      tenantId,
      merchantId: batch.merchantId,
      batchId: batch.id,
      fromStatus: null,
      toStatus: batch.status,
      source: 'PAYMENT_BATCH_SERVICE',
      reason: null,
    })
    return { batch, items }
  }

  private validateOrderIds(paymentOrderIds: string[]): void {
    if (paymentOrderIds.length < 1 || paymentOrderIds.length > 500)
      throw new BadRequestException('支付批次必须包含 1 至 500 笔订单')
    if (new Set(paymentOrderIds).size !== paymentOrderIds.length)
      throw new BadRequestException('支付批次不能包含重复订单')
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code === '23505'
    )
  }
}
