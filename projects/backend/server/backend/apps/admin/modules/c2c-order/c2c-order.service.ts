import { createRelativeBusinessDayWindow } from '@/common/time'
import { formatDecimal } from '@/common/utils/decimal'
import {
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@admin/database'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  Between,
  DataSource,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  Repository,
} from 'typeorm'
import type { MerchantOrderListDto, MerchantOrderStatisticsDto } from './c2c-order.dto'

interface OrderStatisticsRow {
  todayPendingAmount: string
  todayPendingCount: string
  todaySuccessAmount: string
  todaySuccessCount: string
  yesterdaySuccessAmount: string
  yesterdaySuccessCount: string
}

@Injectable()
export class C2cOrderService {
  constructor(
    @InjectRepository(MerchantOrderEntity)
    private readonly orderRepository: Repository<MerchantOrderEntity>,
    @InjectRepository(MerchantOrderStatusHistoryEntity)
    private readonly historyRepository: Repository<MerchantOrderStatusHistoryEntity>,
    @InjectRepository(PaymentOrderEntity)
    private readonly paymentRepository: Repository<PaymentOrderEntity>,
    @InjectRepository(PaymentOrderStatusHistoryEntity)
    private readonly paymentHistoryRepository: Repository<PaymentOrderStatusHistoryEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, input: MerchantOrderListDto) {
    const [items, total] = await this.orderRepository.findAndCount({
      where: {
        tenantId,
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.status ? { status: input.status } : {}),
        ...(input.platformOrderId ? { platformOrderId: ILike(`%${input.platformOrderId}%`) } : {}),
        ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
        ...this.timeFilter(input.startTime, input.endTime),
      },
      order: { platformCreatedAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    const payments = items.length
      ? await this.paymentRepository.find({
          where: {
            tenantId,
            ...(input.merchantId ? { merchantId: input.merchantId } : {}),
            sourceType: PaymentSourceType.C2C_BUY,
            sourceBusinessNo: In(items.map(({ platformOrderId }) => platformOrderId)),
          },
        })
      : []
    const paymentBySource = new Map(
      payments.map((payment) => [`${payment.merchantId}:${payment.sourceBusinessNo}`, payment]),
    )
    return {
      items: items.map((item) => ({
        ...item,
        paymentOrder: paymentBySource.get(`${item.merchantId}:${item.platformOrderId}`) ?? null,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async detail(tenantId: string, merchantId: string, id: string) {
    const order = await this.orderRepository.findOne({ where: { id, tenantId, merchantId } })
    if (!order) throw new NotFoundException('商家订单不存在')
    const [history, payments] = await Promise.all([
      this.historyRepository.find({
        where: { tenantId, merchantId, merchantOrderId: id },
        order: { createdAt: 'ASC' },
      }),
      this.paymentRepository.find({
        where: {
          tenantId,
          merchantId,
          sourceType: PaymentSourceType.C2C_BUY,
          sourceBusinessNo: order.platformOrderId,
        },
      }),
    ])
    const paymentOrder = payments[0]
    const paymentHistory = paymentOrder
      ? await this.paymentHistoryRepository.find({
          where: { tenantId, merchantId, paymentOrderId: paymentOrder.id },
          order: { createdAt: 'ASC' },
        })
      : []
    return {
      ...order,
      history,
      paymentOrder: paymentOrder ? { ...paymentOrder, history: paymentHistory } : null,
    }
  }

  async statistics(tenantId: string, input: MerchantOrderStatisticsDto) {
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
    const filters = ['"tenantId" = $1']
    const addFilter = (sql: string, value: unknown) => {
      parameters.push(value)
      filters.push(sql.replace('?', `$${parameters.length}`))
    }
    if (input.merchantId) addFilter('"merchantId" = ?', input.merchantId)
    if (input.platformOrderId) addFilter('"platformOrderId" ILIKE ?', `%${input.platformOrderId}%`)
    if (input.paymentMethod) addFilter('"paymentMethod" = ?', input.paymentMethod)

    const [row] = (await this.dataSource.query(
      `SELECT
        COUNT(*) FILTER (WHERE status = 'COMPLETED'
          AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3)::text AS "todaySuccessCount",
        COALESCE(SUM("fiatAmount") FILTER (WHERE status = 'COMPLETED'
          AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3), 0)::text AS "todaySuccessAmount",
        COUNT(*) FILTER (WHERE status = 'COMPLETED'
          AND "platformCreatedAt" >= $4 AND "platformCreatedAt" < $5)::text AS "yesterdaySuccessCount",
        COALESCE(SUM("fiatAmount") FILTER (WHERE status = 'COMPLETED'
          AND "platformCreatedAt" >= $4 AND "platformCreatedAt" < $5), 0)::text AS "yesterdaySuccessAmount",
        COUNT(*) FILTER (WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING')
          AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3)::text AS "todayPendingCount",
        COALESCE(SUM("fiatAmount") FILTER (WHERE status IN ('PENDING_PAYMENT', 'PAYMENT_PROCESSING')
          AND "platformCreatedAt" >= $2 AND "platformCreatedAt" < $3), 0)::text AS "todayPendingAmount"
      FROM merchant_order
      WHERE ${filters.join(' AND ')}`,
      parameters,
    )) as OrderStatisticsRow[]
    return mapStatistics(row)
  }

  private timeFilter(startTime?: string, endTime?: string) {
    if (startTime && endTime)
      return { platformCreatedAt: Between(new Date(startTime), new Date(endTime)) }
    if (startTime) return { platformCreatedAt: MoreThanOrEqual(new Date(startTime)) }
    if (endTime) return { platformCreatedAt: LessThanOrEqual(new Date(endTime)) }
    return {}
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
