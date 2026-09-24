import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'
import { createRelativeBusinessDayWindow } from '@/common/time'
import { formatDecimal } from '@/common/utils/decimal'
import {
  BusinessStatus,
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatus,
  PaymentBatchEntity,
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
import {
  DataSource,
  type EntityManager,
  type FindOptionsWhere,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm'
import {
  PAYMENT_PLAN_RESOLVER,
  type PaymentPlanResolverPort,
  type ResolvedPaymentPlan,
} from './payment-plan-resolver'
import { normalizeCnyAmount, sameCnyAmount } from './payment-adapter.types'
import type { PaymentOrderListDto, PaymentOrderStatisticsDto } from './payment-order.dto'

interface OrderStatisticsRow {
  todayPendingAmount: string
  todayPendingCount: string
  todaySuccessAmount: string
  todaySuccessCount: string
  yesterdaySuccessAmount: string
  yesterdaySuccessCount: string
}

export interface CreatePaymentOrderInput {
  merchantId: string
  sourceType: PaymentSourceType
  sourceBusinessNo: string
  amount: string
  currency: string
  paymentMethod: string
  executionMode?: PaymentExecutionMode
  payeeIdentity: string
  payeeName: string
}

export interface PaymentOrderCreationOptions {
  automaticOnly?: boolean
  requireRoute?: boolean
  reason: string
  source: string
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
    const baseWhere: FindOptionsWhere<PaymentOrderEntity> = {
      tenantId,
      ...(input.merchantId ? { merchantId: input.merchantId } : {}),
      ...(input.executionMode ? { executionMode: input.executionMode } : {}),
      ...(input.sourceType ? { sourceType: input.sourceType } : {}),
      ...(input.status ? { status: input.status } : {}),
    }
    const where = input.orderNo
      ? await this.buildOrderNumberWhere(tenantId, input.orderNo, baseWhere)
      : baseWhere
    const [items, total] = await this.orders.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    const batchNumbers = await this.findLatestBatchNumbers(tenantId, items)
    return {
      items: items.map((order) => ({
        ...order,
        batchNo: batchNumbers.get(order.id) ?? null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
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

  async statistics(tenantId: string, input: PaymentOrderStatisticsDto) {
    const now = new Date()
    const today = createRelativeBusinessDayWindow(0, { now })
    const yesterday = createRelativeBusinessDayWindow(-1, { now })
    const parameters: unknown[] = [
      tenantId,
      today.start,
      today.endExclusive,
      yesterday.start,
      yesterday.endExclusive,
    ]
    const filters = ['payment_order."tenantId" = $1']
    const addFilter = (sql: string, value: unknown) => {
      parameters.push(value)
      filters.push(sql.replaceAll('?', `$${parameters.length}`))
    }
    if (input.merchantId) addFilter('payment_order."merchantId" = ?', input.merchantId)
    if (input.executionMode) addFilter('payment_order."executionMode" = ?', input.executionMode)
    if (input.sourceType) addFilter('payment_order."sourceType" = ?', input.sourceType)
    if (input.orderNo) {
      addFilter(
        `(payment_order."paymentNo" = ? OR payment_order."sourceBusinessNo" = ?
          OR payment_order."upstreamId" = ? OR EXISTS (
            SELECT 1 FROM payment_batch_item
            INNER JOIN payment_batch ON payment_batch.id = payment_batch_item."batchId"
            WHERE payment_batch_item."paymentOrderId" = payment_order.id
              AND payment_batch_item."tenantId" = payment_order."tenantId"
              AND payment_batch."tenantId" = payment_order."tenantId"
              AND payment_batch."batchNo" = ?
          ))`,
        input.orderNo,
      )
    }

    const [row] = (await this.dataSource.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'SUCCESS'
          AND "createdAt" >= $2 AND "createdAt" < $3)::text AS "todaySuccessCount",
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'
          AND "createdAt" >= $2 AND "createdAt" < $3), 0)::text AS "todaySuccessAmount",
        COUNT(*) FILTER (WHERE status = 'SUCCESS'
          AND "createdAt" >= $4 AND "createdAt" < $5)::text AS "yesterdaySuccessCount",
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'
          AND "createdAt" >= $4 AND "createdAt" < $5), 0)::text AS "yesterdaySuccessAmount",
        COUNT(*) FILTER (WHERE status IN ('PENDING_CONFIG', 'CREATED', 'READY')
          AND "createdAt" >= $2 AND "createdAt" < $3)::text AS "todayPendingCount",
        COALESCE(SUM(amount) FILTER (WHERE status IN ('PENDING_CONFIG', 'CREATED', 'READY')
          AND "createdAt" >= $2 AND "createdAt" < $3), 0)::text AS "todayPendingAmount"
      FROM payment_order
      WHERE ${filters.join(' AND ')}`,
      parameters,
    )) as OrderStatisticsRow[]
    return mapStatistics(row)
  }

  async create(
    tenantId: string,
    input: CreatePaymentOrderInput,
    options?: Partial<PaymentOrderCreationOptions>,
  ): Promise<PaymentOrderEntity> {
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
    const route = await this.resolveRoute(tenantId, normalizedInput, options?.automaticOnly)
    if (!route && (options?.requireRoute || !normalizedInput.executionMode)) {
      throw new BadRequestException('未匹配到可用的支付方案')
    }
    const executionMode = route?.executionMode ?? normalizedInput.executionMode!
    const order = this.orders.create({
      ...normalizedInput,
      executionMode,
      tenantId,
      paymentNo: IdUtils.generateBusinessNo(BusinessNoPrefix.PAYMENT_ORDER),
      ...this.routeFields(route),
      status: route ? PaymentOrderStatus.READY : PaymentOrderStatus.PENDING_CONFIG,
      upstreamId: null,
      lastError: null,
    })
    try {
      return await this.dataSource.transaction(async (manager) => {
        const saved = await manager.save(PaymentOrderEntity, order)
        await this.assertC2cOrderStillPayable(manager, saved)
        await manager.insert(PaymentOrderStatusHistoryEntity, {
          tenantId,
          merchantId: saved.merchantId,
          paymentOrderId: saved.id,
          fromStatus: null,
          toStatus: saved.status,
          source: options?.source ?? 'PAYMENT_ORDER_SERVICE',
          reason: options?.reason ?? null,
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

  async rematch(
    tenantId: string,
    orderId: string,
    automaticOnly = false,
  ): Promise<PaymentOrderEntity> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(PaymentOrderEntity, {
        where: { id: orderId, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!order) throw new BadRequestException('支付订单不存在或不属于当前所属单位')
      if (order.status !== PaymentOrderStatus.PENDING_CONFIG)
        throw new ConflictException('只有待配置支付订单可以重新匹配')
      const route = await this.resolveRoute(tenantId, order, automaticOnly)
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

  private async buildOrderNumberWhere(
    tenantId: string,
    orderNo: string,
    baseWhere: FindOptionsWhere<PaymentOrderEntity>,
  ): Promise<FindOptionsWhere<PaymentOrderEntity>[]> {
    const batches = await this.dataSource.getRepository(PaymentBatchEntity).find({
      select: { id: true },
      where: { batchNo: orderNo, tenantId },
    })
    const batchIds = batches.map(({ id }) => id)
    const batchItems =
      batchIds.length === 0
        ? []
        : await this.dataSource.getRepository(PaymentBatchItemEntity).find({
            select: { paymentOrderId: true },
            where: { batchId: In(batchIds), tenantId },
          })
    const paymentOrderIds = [...new Set(batchItems.map(({ paymentOrderId }) => paymentOrderId))]

    return [
      { ...baseWhere, paymentNo: orderNo },
      { ...baseWhere, sourceBusinessNo: orderNo },
      { ...baseWhere, upstreamId: orderNo },
      ...(paymentOrderIds.length > 0 ? [{ ...baseWhere, id: In(paymentOrderIds) }] : []),
    ]
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

  private async findLatestBatchNumbers(
    tenantId: string,
    orders: PaymentOrderEntity[],
  ): Promise<Map<string, string>> {
    if (orders.length === 0) return new Map()
    const merchantIds = [...new Set(orders.map(({ merchantId }) => merchantId))]
    const items = await this.dataSource.getRepository(PaymentBatchItemEntity).find({
      select: { batchId: true, paymentOrderId: true },
      where: {
        tenantId,
        merchantId: In(merchantIds),
        paymentOrderId: In(orders.map(({ id }) => id)),
      },
      order: { createdAt: 'DESC' },
    })
    const latestBatchByOrder = new Map<string, string>()
    for (const item of items) {
      if (!latestBatchByOrder.has(item.paymentOrderId)) {
        latestBatchByOrder.set(item.paymentOrderId, item.batchId)
      }
    }
    const batchIds = [...new Set(latestBatchByOrder.values())]
    if (batchIds.length === 0) return new Map()
    const batches = await this.dataSource.getRepository(PaymentBatchEntity).find({
      select: { batchNo: true, id: true },
      where: { id: In(batchIds), merchantId: In(merchantIds), tenantId },
    })
    const batchNoById = new Map(batches.map(({ batchNo, id }) => [id, batchNo]))
    const result = new Map<string, string>()
    for (const [paymentOrderId, batchId] of latestBatchByOrder) {
      const batchNo = batchNoById.get(batchId)
      if (batchNo) result.set(paymentOrderId, batchNo)
    }
    return result
  }

  private resolveRoute(
    tenantId: string,
    input: CreatePaymentOrderInput | PaymentOrderEntity,
    automaticOnly = false,
  ) {
    return this.plans.resolve({
      tenantId,
      merchantId: input.merchantId,
      scene: input.sourceType,
      currency: input.currency,
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      executionMode: input.executionMode,
      automaticOnly,
      routingKey: input.sourceBusinessNo,
    })
  }

  private async assertC2cOrderStillPayable(
    manager: EntityManager,
    paymentOrder: PaymentOrderEntity,
  ): Promise<void> {
    if (paymentOrder.sourceType !== PaymentSourceType.C2C_BUY) return
    const merchantOrder = await manager.getRepository(MerchantOrderEntity).findOne({
      where: {
        tenantId: paymentOrder.tenantId,
        merchantId: paymentOrder.merchantId,
        platformOrderId: paymentOrder.sourceBusinessNo,
        status: MerchantOrderStatus.PENDING_PAYMENT,
      },
      lock: { mode: 'pessimistic_write' },
    })
    if (!merchantOrder) throw new ConflictException('商家订单已不可创建支付')
  }

  private routeFields(route: ResolvedPaymentPlan | null) {
    return {
      paymentPlanId: route?.planId ?? null,
      batchPolicyId: route?.batchPolicyId ?? null,
      paymentAccountId: route?.paymentAccountId ?? null,
      paymentAccountChannelId: route?.paymentAccountChannelId ?? null,
    }
  }

  private assertSameBusinessIntent(
    existing: PaymentOrderEntity,
    input: CreatePaymentOrderInput,
  ): PaymentOrderEntity {
    const unchanged =
      sameCnyAmount(existing.amount, input.amount) &&
      existing.currency === input.currency &&
      existing.paymentMethod === input.paymentMethod &&
      (input.executionMode === undefined || existing.executionMode === input.executionMode) &&
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

function mapStatistics(row?: OrderStatisticsRow) {
  const metric = (amount?: string, count?: string) => ({
    amount: formatDecimal(amount, 2),
    count: Number(count ?? 0),
  })
  return {
    todayPending: metric(row?.todayPendingAmount, row?.todayPendingCount),
    todaySuccess: metric(row?.todaySuccessAmount, row?.todaySuccessCount),
    yesterdaySuccess: metric(row?.yesterdaySuccessAmount, row?.yesterdaySuccessCount),
  }
}
