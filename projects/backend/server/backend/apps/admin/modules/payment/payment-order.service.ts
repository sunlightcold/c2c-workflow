import { randomUUID } from 'node:crypto'
import {
  BusinessStatus,
  MerchantEntity,
  PaymentBatchItemEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, QueryFailedError, Repository } from 'typeorm'
import {
  PAYMENT_PLAN_RESOLVER,
  type PaymentPlanResolverPort,
  type ResolvedPaymentPlan,
} from './payment-plan-resolver'
import { normalizeCnyAmount } from './payment-adapter.types'
import type { PaymentOrderListDto } from './payment-order.dto'

export interface CreatePaymentOrderInput {
  merchantId: string
  sourceType: PaymentSourceType
  sourceBusinessNo: string
  amount: string
  currency: string
  paymentMethod: string
  executionMode: PaymentExecutionMode
  payeeIdentity: string
  payeeName: string
}

@Injectable()
export class PaymentOrderService {
  constructor(
    @InjectRepository(PaymentOrderEntity)
    private readonly orders: Repository<PaymentOrderEntity>,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    @Inject(PAYMENT_PLAN_RESOLVER)
    private readonly plans: PaymentPlanResolverPort,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, input: PaymentOrderListDto) {
    const [items, total] = await this.orders.findAndCount({
      where: {
        tenantId,
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.executionMode ? { executionMode: input.executionMode } : {}),
        ...(input.sourceType ? { sourceType: input.sourceType } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async detail(tenantId: string, orderId: string) {
    const order = await this.orders.findOne({ where: { id: orderId, tenantId } })
    if (!order) throw new NotFoundException('支付订单不存在')
    const [history, batchItems] = await Promise.all([
      this.dataSource.getRepository(PaymentOrderStatusHistoryEntity).find({
        where: { tenantId, merchantId: order.merchantId, paymentOrderId: order.id },
        order: { createdAt: 'ASC' },
      }),
      this.dataSource.getRepository(PaymentBatchItemEntity).find({
        where: { tenantId, merchantId: order.merchantId, paymentOrderId: order.id },
        order: { createdAt: 'ASC' },
      }),
    ])
    return { ...order, history, batchItems }
  }

  async create(tenantId: string, input: CreatePaymentOrderInput): Promise<PaymentOrderEntity> {
    if (input.sourceType === PaymentSourceType.REFUND)
      throw new BadRequestException('退款支付尚未开放')
    if (input.paymentMethod !== 'ALIPAY' || input.currency !== 'CNY')
      throw new BadRequestException('本期支付宝支付只支持 CNY')
    const normalizedInput = { ...input, amount: normalizeCnyAmount(input.amount) }
    const existing = await this.findBySource(tenantId, normalizedInput)
    if (existing) return this.assertSameBusinessIntent(existing, normalizedInput)
    const merchant = await this.merchants.findOne({
      where: { id: input.merchantId, tenantId, status: BusinessStatus.ACTIVE },
    })
    if (!merchant) throw new BadRequestException('商家不可用或不属于当前所属单位')
    const route = await this.resolveRoute(tenantId, normalizedInput)
    const order = this.orders.create({
      ...normalizedInput,
      tenantId,
      paymentNo: `PAY${randomUUID().replaceAll('-', '').toUpperCase()}`,
      ...this.routeFields(route),
      status: route ? PaymentOrderStatus.READY : PaymentOrderStatus.PENDING_CONFIG,
      upstreamId: null,
      lastError: null,
    })
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(PaymentOrderEntity, order)
        await manager.insert(PaymentOrderStatusHistoryEntity, {
          tenantId,
          merchantId: saved.merchantId,
          paymentOrderId: saved.id,
          fromStatus: null,
          toStatus: saved.status,
          source: 'PAYMENT_ORDER_SERVICE',
          reason: null,
        })
        return saved
      })
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error
      const concurrent = await this.findBySource(tenantId, normalizedInput)
      if (!concurrent) throw error
      return this.assertSameBusinessIntent(concurrent, normalizedInput)
    }
  }

  async rematch(tenantId: string, orderId: string): Promise<PaymentOrderEntity> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PaymentOrderEntity, {
        where: { id: orderId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!order) throw new BadRequestException('支付订单不存在或不属于当前所属单位')
      if (order.status !== PaymentOrderStatus.PENDING_CONFIG)
        throw new ConflictException('只有待配置支付订单可以重新匹配')
      const route = await this.resolveRoute(tenantId, order)
      if (!route) return order
      Object.assign(order, this.routeFields(route), { status: PaymentOrderStatus.READY })
      const saved = await manager.save(PaymentOrderEntity, order)
      await manager.insert(PaymentOrderStatusHistoryEntity, {
        tenantId,
        merchantId: saved.merchantId,
        paymentOrderId: saved.id,
        fromStatus: PaymentOrderStatus.PENDING_CONFIG,
        toStatus: PaymentOrderStatus.READY,
        source: 'PAYMENT_ORDER_SERVICE',
        reason: null,
      })
      return saved
    })
  }

  private findBySource(
    tenantId: string,
    input: Pick<CreatePaymentOrderInput, 'merchantId' | 'sourceType' | 'sourceBusinessNo'>,
  ) {
    return this.orders.findOne({
      where: {
        tenantId,
        merchantId: input.merchantId,
        sourceType: input.sourceType,
        sourceBusinessNo: input.sourceBusinessNo,
      },
    })
  }

  private resolveRoute(tenantId: string, input: CreatePaymentOrderInput | PaymentOrderEntity) {
    return this.plans.resolve({
      tenantId,
      merchantId: input.merchantId,
      scene: input.sourceType,
      currency: input.currency,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      executionMode: input.executionMode,
      routingKey: `${input.sourceType}:${input.sourceBusinessNo}`,
    })
  }

  private routeFields(route: ResolvedPaymentPlan | null) {
    return {
      paymentPlanId: route?.planId ?? null,
      paymentAccountId: route?.paymentAccountId ?? null,
      paymentAccountChannelId: route?.paymentAccountChannelId ?? null,
    }
  }

  private assertSameBusinessIntent(
    existing: PaymentOrderEntity,
    input: CreatePaymentOrderInput,
  ): PaymentOrderEntity {
    const unchanged =
      existing.amount === input.amount &&
      existing.currency === input.currency &&
      existing.paymentMethod === input.paymentMethod &&
      existing.executionMode === input.executionMode &&
      existing.payeeIdentity === input.payeeIdentity &&
      existing.payeeName === input.payeeName
    if (!unchanged) throw new ConflictException('来源业务编号已用于不同的支付信息')
    return existing
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code === '23505'
    )
  }
}
