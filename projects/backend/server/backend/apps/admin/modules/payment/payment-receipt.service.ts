import {
  PaymentAccountEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentAdapterCode,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
} from '@admin/database'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PAYMENT_CHANNEL_CAPABILITY_FACTORY,
  type PaymentChannelCapabilities,
  type PaymentChannelCapabilityFactory,
} from './payment-channel-capability.factory'

export const PAYMENT_RECEIPT_OPTIONS = Symbol('PAYMENT_RECEIPT_OPTIONS')

export interface PaymentReceiptOptions {
  maxAttempts?: number
  pollIntervalMs?: number
}

export interface PaymentReceiptResult {
  status: 'READY' | 'FAILED'
  downloadUrl?: string
  message: string
}

@Injectable()
export class PaymentReceiptService {
  private readonly fileIds = new Map<string, string>()
  private readonly running = new Map<string, Promise<PaymentReceiptResult>>()

  constructor(
    @InjectRepository(PaymentOrderEntity)
    private readonly orders: Repository<PaymentOrderEntity>,
    @InjectRepository(PaymentBatchItemEntity)
    private readonly items: Repository<PaymentBatchItemEntity>,
    @InjectRepository(PaymentBatchEntity)
    private readonly batches: Repository<PaymentBatchEntity>,
    @InjectRepository(PaymentAccountEntity)
    private readonly accounts: Repository<PaymentAccountEntity>,
    @Inject(PAYMENT_CHANNEL_CAPABILITY_FACTORY)
    private readonly channels: PaymentChannelCapabilityFactory,
    @Optional()
    @Inject(PAYMENT_RECEIPT_OPTIONS)
    private readonly options: PaymentReceiptOptions = {},
  ) {}

  async getReceipt(
    tenantId: string,
    merchantId: string,
    paymentOrderId: string,
  ): Promise<PaymentReceiptResult> {
    const taskKey = `${tenantId}:${merchantId}:${paymentOrderId}`
    const existing = this.running.get(taskKey)
    if (existing) return existing
    const task = this.loadReceipt(tenantId, merchantId, paymentOrderId, taskKey)
    this.running.set(taskKey, task)
    try {
      return await task
    } finally {
      if (this.running.get(taskKey) === task) this.running.delete(taskKey)
    }
  }

  private async loadReceipt(
    tenantId: string,
    merchantId: string,
    paymentOrderId: string,
    taskKey: string,
  ): Promise<PaymentReceiptResult> {
    const order = await this.orders.findOne({
      where: { id: paymentOrderId, tenantId, merchantId },
    })
    if (!order) return this.failed('未查询到支付订单，无法获取回单')
    if (
      ![
        PaymentOrderStatus.SUCCESS,
        PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
        PaymentOrderStatus.COMPLETED,
        PaymentOrderStatus.FUND_EXCEPTION,
      ].includes(order.status)
    ) {
      return this.failed(`支付订单 ${order.paymentNo} 尚未完成，暂无回单`)
    }
    if (!order.paymentAccountId) return this.failed('支付订单未关联支付账号，无法获取回单')

    const account = await this.accounts
      .createQueryBuilder('account')
      .addSelect('account.credentialRef')
      .where('account.id = :accountId', { accountId: order.paymentAccountId })
      .andWhere('account.tenantId = :tenantId', { tenantId })
      .getOne()
    if (!account?.credentialRef) return this.failed('支付账号凭据不可用，无法获取回单')

    try {
      const adapterCode =
        order.executionMode === PaymentExecutionMode.INSTANT
          ? PaymentAdapterCode.ALIPAY_MERCHANT_TRANSFER
          : PaymentAdapterCode.ALIPAY_BATCH
      const channel = await this.channels.create(adapterCode, account.credentialRef)
      let fileId = this.fileIds.get(taskKey)
      if (!fileId) {
        const detailId = await this.receiptDetailId(order, channel)
        fileId = await channel.receipt.apply(detailId)
        this.fileIds.set(taskKey, fileId)
      }

      const maxAttempts = this.positiveInteger(this.options.maxAttempts, 20)
      const intervalMs = this.nonNegativeInteger(this.options.pollIntervalMs, 3000)
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const result = await channel.receipt.query(fileId)
        if (result.status === 'SUCCESS') {
          return {
            status: 'READY',
            downloadUrl: result.downloadUrl,
            message: '回单已生成',
          }
        }
        if (result.status === 'FAIL') {
          this.fileIds.delete(taskKey)
          return this.failed(result.errorMessage || '回单生成失败')
        }
        if (attempt < maxAttempts && intervalMs > 0) await this.wait(intervalMs)
      }
      return this.failed('回单生成超时')
    } catch (error) {
      return this.failed(error instanceof Error ? error.message : '获取回单失败')
    }
  }

  private async receiptDetailId(
    order: PaymentOrderEntity,
    channel: PaymentChannelCapabilities,
  ): Promise<string> {
    if (order.executionMode === PaymentExecutionMode.INSTANT) {
      if (!order.upstreamId) throw new Error('支付订单未返回支付宝流水号')
      return order.upstreamId
    }

    const item = await this.items.findOne({
      where: {
        tenantId: order.tenantId,
        merchantId: order.merchantId,
        paymentOrderId: order.id,
      },
    })
    if (!item || item.status !== PaymentBatchItemStatus.SUCCESS) {
      throw new Error('支付批次明细未成功，暂不能申请回单')
    }
    const batch = await this.batches.findOne({
      where: {
        id: item.batchId,
        tenantId: order.tenantId,
        merchantId: order.merchantId,
      },
    })
    if (!batch) throw new Error('未查询到支付批次，无法获取回单')

    const query = await channel.batch.query(batch.batchNo)
    if (query.raw.code !== '10000') {
      throw new Error(query.errorMessage || '支付宝批次查询失败')
    }
    const detail = query.raw.accDetailList?.find(({ outBizNo }) => outBizNo === order.paymentNo)
    if (!detail) throw new Error('支付宝批次明细订单号不匹配')
    if (detail.status !== 'SUCCESS') throw new Error('支付宝订单明细未成功，暂不能申请回单')
    if (!detail.detailId) throw new Error('支付宝批次查询未返回明细订单号')
    return detail.detailId
  }

  private failed(message: string): PaymentReceiptResult {
    return { status: 'FAILED', message: message.slice(0, 512) }
  }

  private positiveInteger(value: number | undefined, fallback: number): number {
    return Number.isInteger(value) && Number(value) > 0 ? Number(value) : fallback
  }

  private nonNegativeInteger(value: number | undefined, fallback: number): number {
    return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : fallback
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms)
    })
  }
}
