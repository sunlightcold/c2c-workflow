import {
  BusinessStatus,
  MerchantOrderEntity,
  PaymentBatchEntity,
  PaymentOrderEntity,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
} from '@admin/database'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { OnEvent } from '@nestjs/event-emitter'
import {
  EVENT_KEYS,
  type TelegramBatchStatusPayload,
  type TelegramExceptionPayload,
  type TelegramOrderDiscoveredPayload,
  type TelegramPaymentStatusPayload,
} from '../event-emitter'
import { TelegramApiClient } from './telegram-api.client'

export enum TelegramNotificationEvent {
  ORDER_DISCOVERED = 'ORDER_DISCOVERED',
  PAYMENT_STATUS = 'PAYMENT_STATUS',
  BATCH_STATUS = 'BATCH_STATUS',
  EXCEPTION = 'EXCEPTION',
}

@Injectable()
export class TelegramNotificationService {
  private readonly logger = new Logger(TelegramNotificationService.name)

  constructor(
    @InjectRepository(TelegramGroupEntity) private readonly groups: Repository<TelegramGroupEntity>,
    @InjectRepository(TelegramBotEntity) private readonly bots: Repository<TelegramBotEntity>,
    @InjectRepository(MerchantOrderEntity)
    private readonly merchantOrders: Repository<MerchantOrderEntity>,
    @InjectRepository(PaymentOrderEntity)
    private readonly paymentOrders: Repository<PaymentOrderEntity>,
    @InjectRepository(PaymentBatchEntity)
    private readonly paymentBatches: Repository<PaymentBatchEntity>,
    private readonly telegram: TelegramApiClient,
  ) {}

  @OnEvent(EVENT_KEYS.TELEGRAM_ORDER_DISCOVERED)
  async onOrderDiscovered(payload: TelegramOrderDiscoveredPayload): Promise<void> {
    await this.notifyOrderDiscovered(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_PAYMENT_STATUS)
  async onPaymentStatus(payload: TelegramPaymentStatusPayload): Promise<void> {
    await this.notifyPaymentStatus(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_BATCH_STATUS)
  async onBatchStatus(payload: TelegramBatchStatusPayload): Promise<void> {
    await this.notifyBatchStatus(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_EXCEPTION)
  async onException(payload: TelegramExceptionPayload): Promise<void> {
    await this.notifyException(payload)
  }

  async notifyOrderDiscovered(payload: TelegramOrderDiscoveredPayload): Promise<void> {
    if (!payload.orderIds.length) return
    const orders = await this.merchantOrders.find({
      where: {
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
        id: In(payload.orderIds),
      },
    })
    for (const order of orders) {
      await this.sendToMerchantGroups(
        payload.tenantId,
        payload.merchantId,
        TelegramNotificationEvent.ORDER_DISCOVERED,
        [
          `发现新的商家订单：${order.platformOrderId}`,
          `金额：${order.fiatAmount} ${order.fiatCurrency}`,
          `收款人：${order.payeeName ?? '-'} / ${order.payeeIdentity ?? '-'}`,
          `状态：${order.status}`,
        ].join('\n'),
      )
    }
  }

  async notifyPaymentStatus(payload: TelegramPaymentStatusPayload): Promise<void> {
    const payment = payload.paymentOrderId
      ? await this.paymentOrders.findOne({
          where: {
            id: payload.paymentOrderId,
            tenantId: payload.tenantId,
            merchantId: payload.merchantId,
          },
        })
      : null
    const paymentNo = payment?.paymentNo ?? payload.paymentNo ?? payload.paymentOrderId
    const sourceNo = payment?.sourceBusinessNo ?? payload.sourceBusinessNo
    const lines = [
      `支付结果通知：${paymentNo}`,
      ...(sourceNo ? [`商家订单：${sourceNo}`] : []),
      `状态：${payload.status}`,
    ]
    if (payload.upstreamId) lines.push(`平台流水号：${payload.upstreamId}`)
    if (payload.errorMessage) lines.push(`失败原因：${payload.errorMessage}`)
    const replyMarkup =
      ['SUCCESS', 'COMPLETED'].includes(payload.status) && payload.paymentOrderId
        ? {
            inline_keyboard: [
              [{ text: '获取回单', callback_data: `receipt:${payload.paymentOrderId}` }],
            ],
          }
        : undefined
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.PAYMENT_STATUS,
      lines.join('\n'),
      replyMarkup,
    )
  }

  async notifyBatchStatus(payload: TelegramBatchStatusPayload): Promise<void> {
    const batch = await this.paymentBatches.findOne({
      where: { id: payload.batchId, tenantId: payload.tenantId, merchantId: payload.merchantId },
    })
    const batchNo = batch?.batchNo ?? payload.batchNo ?? payload.batchId
    const total = batch?.totalCount ?? payload.totalCount
    const success = batch?.successCount ?? payload.successCount
    const failed = batch?.failedCount ?? payload.failedCount
    const processing = batch?.processingCount ?? payload.processingCount
    const unknown = batch?.unknownCount ?? payload.unknownCount
    const lines = [`支付批次通知：${batchNo}`, `状态：${payload.status}`]
    if (total !== undefined)
      lines.push(
        `总笔数：${total}，成功：${success ?? 0}，失败：${failed ?? 0}，处理中：${processing ?? 0}，未知：${unknown ?? 0}`,
      )
    if (payload.errorMessage) lines.push(`异常：${payload.errorMessage}`)
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.BATCH_STATUS,
      lines.join('\n'),
    )
  }

  async notifyException(payload: TelegramExceptionPayload): Promise<void> {
    const text = [
      `支付异常通知：${payload.code}`,
      payload.message,
      ...(payload.referenceId ? [`关联单号：${payload.referenceId}`] : []),
    ].join('\n')
    if (payload.merchantId) {
      await this.sendToMerchantGroups(
        payload.tenantId,
        payload.merchantId,
        TelegramNotificationEvent.EXCEPTION,
        text,
      )
      return
    }
    const groups = await this.groups.find({
      where: {
        tenantId: payload.tenantId,
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
      },
    })
    await this.sendGroups(groups, text, TelegramNotificationEvent.EXCEPTION)
  }

  private async sendToMerchantGroups(
    tenantId: string,
    merchantId: string,
    event: TelegramNotificationEvent,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    const groups = await this.groups.find({
      where: {
        tenantId,
        merchantId,
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
      },
    })
    await this.sendGroups(
      groups.filter((group) => group.tenantId === tenantId && group.merchantId === merchantId),
      text,
      event,
      replyMarkup,
    )
  }

  private async sendGroups(
    groups: TelegramGroupEntity[],
    text: string,
    event: TelegramNotificationEvent,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    for (const group of groups) {
      if (group.bindingState !== TelegramGroupBindingState.ACTIVE || !group.notificationsEnabled)
        continue
      if (!group.chatId || !group.notificationEvents?.includes(event)) continue
      const bot = await this.bots.findOne({
        where: { id: group.botId, tenantId: group.tenantId, status: BusinessStatus.ACTIVE },
        select: { id: true, tenantId: true, tokenRef: true, status: true },
      })
      if (!bot) continue
      try {
        await this.telegram.sendMessage({
          tokenRef: bot.tokenRef,
          chatId: group.chatId,
          text,
          ...(replyMarkup ? { replyMarkup } : {}),
        })
      } catch {
        this.logger.error(`Telegram 通知发送失败: group=${group.id}, event=${event}`)
      }
    }
  }
}
