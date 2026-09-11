import {
  PaymentBatchEntity,
  PaymentBatchStatus,
  PaymentOrderEntity,
  PaymentOrderStatus,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

const ORDER_STATUS_LABELS: Record<PaymentOrderStatus, string> = {
  [PaymentOrderStatus.PENDING_CONFIG]: '待配置',
  [PaymentOrderStatus.CREATED]: '已创建',
  [PaymentOrderStatus.READY]: '待提交',
  [PaymentOrderStatus.SUBMITTING]: '提交中',
  [PaymentOrderStatus.PROCESSING]: '处理中',
  [PaymentOrderStatus.UNKNOWN]: '结果未知',
  [PaymentOrderStatus.SUCCESS]: '支付成功',
  [PaymentOrderStatus.FAILED]: '支付失败',
  [PaymentOrderStatus.CANCELLED]: '已取消',
  [PaymentOrderStatus.PLATFORM_CONFIRM_PENDING]: '待平台确认',
  [PaymentOrderStatus.COMPLETED]: '已完成',
  [PaymentOrderStatus.FUND_EXCEPTION]: '资金异常',
}

const BATCH_STATUS_LABELS: Record<PaymentBatchStatus, string> = {
  [PaymentBatchStatus.DRAFT]: '草稿',
  [PaymentBatchStatus.PENDING_REVIEW]: '待复核',
  [PaymentBatchStatus.READY]: '待提交',
  [PaymentBatchStatus.SUBMITTING]: '提交中',
  [PaymentBatchStatus.PROCESSING]: '处理中',
  [PaymentBatchStatus.SUCCESS]: '支付成功',
  [PaymentBatchStatus.PARTIAL_SUCCESS]: '部分成功',
  [PaymentBatchStatus.FAILED]: '支付失败',
  [PaymentBatchStatus.UNKNOWN]: '结果未知',
  [PaymentBatchStatus.CANCELLED]: '已取消',
  [PaymentBatchStatus.EXCEPTION]: '资金异常',
}

@Injectable()
export class TelegramQueryService {
  constructor(
    @InjectRepository(PaymentOrderEntity)
    private readonly orders: Repository<PaymentOrderEntity>,
    @InjectRepository(PaymentBatchEntity)
    private readonly batches: Repository<PaymentBatchEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async query(tenantId: string, merchantId: string, businessNo: string): Promise<string> {
    const query = businessNo.trim()
    if (!query) return '请输入支付单号、商户订单号或支付批次号，例如：/query PAY001'
    const order = await this.orders.findOne({
      where: [
        { tenantId, merchantId, paymentNo: query },
        { tenantId, merchantId, sourceBusinessNo: query },
      ],
    })
    if (order) {
      return [
        `支付单号：${order.paymentNo}`,
        `商户订单号：${order.sourceBusinessNo}`,
        `金额：${order.amount} ${order.currency}`,
        `收款人：${order.payeeName} / ${order.payeeIdentity}`,
        `状态：${ORDER_STATUS_LABELS[order.status]}`,
        ...(order.lastError ? [`失败原因：${order.lastError}`] : []),
      ].join('\n')
    }
    const batch = await this.batches.findOne({
      where: { tenantId, merchantId, batchNo: query },
    })
    if (!batch) return '未查询到支付订单或支付批次'
    return [
      `支付批次：${batch.batchNo}`,
      `总金额：${batch.totalAmount} ${batch.currency}`,
      `总笔数：${batch.totalCount}`,
      `成功：${batch.successCount}，失败：${batch.failedCount}，处理中：${batch.processingCount}，未知：${batch.unknownCount}`,
      `状态：${BATCH_STATUS_LABELS[batch.status]}`,
      ...(batch.lastError ? [`失败原因：${batch.lastError}`] : []),
    ].join('\n')
  }

  async todayStats(tenantId: string, merchantId: string): Promise<string> {
    const [row] = (await this.dataSource.query(
      `SELECT COUNT(*)::text AS "totalCount",
              COALESCE(SUM(amount), 0)::text AS "totalAmount",
              COUNT(*) FILTER (WHERE status IN ('SUCCESS', 'PLATFORM_CONFIRM_PENDING', 'COMPLETED'))::text AS "successCount",
              COALESCE(SUM(amount) FILTER (WHERE status IN ('SUCCESS', 'PLATFORM_CONFIRM_PENDING', 'COMPLETED')), 0)::text AS "successAmount"
       FROM payment_order
       WHERE "tenantId" = $1 AND "merchantId" = $2
         AND "createdAt" >= (date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') AT TIME ZONE 'Asia/Shanghai')
         AND "createdAt" < ((date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') + interval '1 day') AT TIME ZONE 'Asia/Shanghai')`,
      [tenantId, merchantId],
    )) as Array<{
      successAmount: string
      successCount: string
      totalAmount: string
      totalCount: string
    }>
    return [
      '今日支付统计',
      `全部：${row.totalCount} 笔 / ${row.totalAmount} CNY`,
      `成功：${row.successCount} 笔 / ${row.successAmount} CNY`,
    ].join('\n')
  }

  status(botCode: string, groupName: string): string {
    return [
      `机器人：${botCode}`,
      `当前群组：${groupName}`,
      '机器人状态：启用',
      '群组状态：已绑定',
    ].join('\n')
  }
}
