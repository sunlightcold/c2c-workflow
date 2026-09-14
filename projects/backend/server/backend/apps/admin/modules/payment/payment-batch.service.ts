import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'
import {
  BusinessStatus,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentAdapterCode,
  PaymentBatchEntity,
  PaymentBatchPolicyEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentChannelEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentSourceType,
  PaymentPlatformEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { DataSource, EntityManager, In, QueryFailedError } from 'typeorm'
import { sumCnyAmounts } from './payment-adapter.types'
import type { PaymentBatchListDto } from './payment-batch.dto'

export interface PaymentBatchView {
  batch: PaymentBatchEntity
  items: Array<
    PaymentBatchItemEntity & {
      payeeIdentity?: string
      payeeName?: string
      paymentNo?: string
    }
  >
}

export interface ReadyPaymentBatchGroup {
  batchPolicyId: string
  currency: string
  merchantId: string
  oldestReadyAt: Date
  paymentAccountChannelId: string
  paymentAccountId: string
  paymentOrderIds: string[]
  totalAmount: string
}

@Injectable()
export class PaymentBatchService {
  constructor(private readonly dataSource: DataSource) {}

  async findReadyGroups(
    tenantId: string,
    merchantId: string | null,
    sourceType: PaymentSourceType,
    batchPolicyId?: string,
  ): Promise<ReadyPaymentBatchGroup[]> {
    const query = this.dataSource
      .getRepository(PaymentOrderEntity)
      .createQueryBuilder('payment_order')
      .where('payment_order."tenantId" = :tenantId', { tenantId })
      .andWhere('payment_order."sourceType" = :sourceType', { sourceType })
      .andWhere('payment_order.status = :status', { status: PaymentOrderStatus.READY })
      .andWhere('payment_order."executionMode" = :executionMode', {
        executionMode: PaymentExecutionMode.BATCH,
      })
      .andWhere('payment_order."paymentMethod" = :paymentMethod', {
        paymentMethod: 'ALIPAY',
      })
      .andWhere('payment_order.currency = :currency', { currency: 'CNY' })
      .andWhere('payment_order."paymentAccountId" IS NOT NULL')
      .andWhere('payment_order."paymentAccountChannelId" IS NOT NULL')
      .andWhere('payment_order."batchPolicyId" IS NOT NULL')
      .andWhere(batchPolicyId ? 'payment_order."batchPolicyId" = :batchPolicyId' : 'TRUE', {
        ...(batchPolicyId ? { batchPolicyId } : {}),
      })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM payment_batch_item active_item
          WHERE active_item."paymentOrderId" = payment_order.id
            AND active_item.status IN (:...activeItemStatuses)
        )`,
        {
          activeItemStatuses: [
            PaymentBatchItemStatus.QUEUED,
            PaymentBatchItemStatus.SUBMITTING,
            PaymentBatchItemStatus.PROCESSING,
            PaymentBatchItemStatus.UNKNOWN,
          ],
        },
      )
      .orderBy('payment_order."createdAt"', 'ASC')
      .take(500)
    if (merchantId) {
      query.andWhere('payment_order."merchantId" = :merchantId', { merchantId })
    }
    const orders = await query.getMany()
    const groups = new Map<string, PaymentOrderEntity[]>()
    for (const order of orders) {
      const key = [
        order.merchantId,
        order.batchPolicyId,
        order.paymentAccountId,
        order.paymentAccountChannelId,
        order.currency,
      ].join(':')
      const group = groups.get(key) ?? []
      group.push(order)
      groups.set(key, group)
    }
    return [...groups.values()].map((group) => ({
      batchPolicyId: group[0].batchPolicyId!,
      currency: group[0].currency,
      merchantId: group[0].merchantId,
      oldestReadyAt: group[0].createdAt,
      paymentAccountChannelId: group[0].paymentAccountChannelId!,
      paymentAccountId: group[0].paymentAccountId!,
      paymentOrderIds: group.map(({ id }) => id),
      totalAmount: sumCnyAmounts(group.map(({ amount }) => amount)),
    }))
  }

  async list(tenantId: string, input: PaymentBatchListDto) {
    const [items, total] = await this.dataSource.getRepository(PaymentBatchEntity).findAndCount({
      where: {
        tenantId,
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.paymentAccountId ? { paymentAccountId: input.paymentAccountId } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async detail(tenantId: string, batchId: string): Promise<PaymentBatchView> {
    const batch = await this.dataSource.getRepository(PaymentBatchEntity).findOne({
      where: { id: batchId, tenantId },
    })
    if (!batch) throw new NotFoundException('支付批次不存在')
    const items = await this.dataSource.getRepository(PaymentBatchItemEntity).find({
      where: { batchId: batch.id, tenantId, merchantId: batch.merchantId },
      order: { createdAt: 'ASC' },
    })
    const orders = items.length
      ? await this.dataSource.getRepository(PaymentOrderEntity).find({
          where: {
            id: In(items.map(({ paymentOrderId }) => paymentOrderId)),
            tenantId,
            merchantId: batch.merchantId,
          },
        })
      : []
    const orderById = new Map(orders.map((order) => [order.id, order]))
    return {
      batch,
      items: items.map((item) => {
        const order = orderById.get(item.paymentOrderId)
        return Object.assign(item, {
          paymentNo: order?.paymentNo ?? item.paymentOrderId,
          payeeName: order?.payeeName ?? '-',
          payeeIdentity: order?.payeeIdentity ?? '-',
        })
      }),
    }
  }

  async create(
    tenantId: string,
    paymentOrderIds: string[],
    trigger: { ruleIds: string[]; source: 'AUTOMATIC' | 'MANUAL' } = {
      ruleIds: [],
      source: 'MANUAL',
    },
  ): Promise<PaymentBatchView> {
    this.validateOrderIds(paymentOrderIds)
    try {
      return await this.dataSource.transaction((manager) =>
        this.createInTransaction(manager, tenantId, paymentOrderIds, trigger),
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
    trigger: { ruleIds: string[]; source: 'AUTOMATIC' | 'MANUAL' },
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
          !order.paymentAccountChannelId ||
          !order.batchPolicyId,
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
          order.batchPolicyId !== first.batchPolicyId ||
          order.currency !== first.currency,
      )
    ) {
      throw new BadRequestException(
        '批次内支付订单的商家、支付账号、支付通道、批次策略和币种必须一致',
      )
    }

    const planIds = [...new Set(orders.map((order) => order.paymentPlanId!))]
    const [plans, account, accountChannel, batchPolicy] = await Promise.all([
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
      manager.getRepository(PaymentBatchPolicyEntity).findOne({
        where: {
          id: first.batchPolicyId!,
          tenantId,
          status: BusinessStatus.ACTIVE,
        },
      }),
    ])
    if (
      plans.length !== planIds.length ||
      !account ||
      !accountChannel ||
      !batchPolicy ||
      (batchPolicy.merchantId !== null && batchPolicy.merchantId !== first.merchantId)
    )
      throw new ConflictException('支付订单锁定的批量支付配置已失效')
    if (
      plans.some(
        (plan) =>
          plan.paymentAccountId !== account.id ||
          plan.paymentAccountChannelId !== accountChannel.id ||
          plan.batchPolicyId !== batchPolicy.id,
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
        batchNo: IdUtils.generateBusinessNo(BusinessNoPrefix.PAYMENT_BATCH),
        paymentAccountId: account.id,
        paymentAccountChannelId: accountChannel.id,
        batchPolicyId: batchPolicy.id,
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
        triggerRuleIds: trigger.ruleIds,
        triggerSource: trigger.source,
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
