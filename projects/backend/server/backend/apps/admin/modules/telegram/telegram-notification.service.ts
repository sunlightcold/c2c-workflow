import {
  BusinessStatus,
  MerchantOrderEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchItemStatus,
  PaymentOrderEntity,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
} from '@admin/database'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
  EVENT_KEYS,
  type TelegramBatchStatusPayload,
  type TelegramBatchSubmittedPayload,
  type TelegramExceptionPayload,
  type TelegramOrderDiscoveredPayload,
  type TelegramPaymentCreatedPayload,
  type TelegramPaymentStatusPayload,
} from '../event-emitter'
import { TelegramApiClient } from './telegram-api.client'
import {
  escapeTelegramHtml,
  formatBatchStatusMessage,
  formatAutomaticBatchSubmissionMessage,
  formatC2cCreatedMessage,
  formatExceptionMessage,
  formatOrderDiscoveredMessage,
  formatPaymentStatusMessage,
  shouldNotifyBatchStatus,
  shouldNotifyOrderDiscovered,
  shouldNotifyPaymentStatus,
  sumMoney,
} from './telegram-notification.formatter'

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
    @Optional()
    @InjectRepository(PaymentBatchItemEntity)
    private readonly paymentBatchItems?: Repository<PaymentBatchItemEntity>,
  ) {}

  @OnEvent(EVENT_KEYS.TELEGRAM_ORDER_DISCOVERED)
  async onOrderDiscovered(payload: TelegramOrderDiscoveredPayload): Promise<void> {
    await this.notifyOrderDiscovered(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_PAYMENT_STATUS)
  async onPaymentStatus(payload: TelegramPaymentStatusPayload): Promise<void> {
    await this.notifyPaymentStatus(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_PAYMENT_CREATED)
  async onPaymentCreated(payload: TelegramPaymentCreatedPayload): Promise<void> {
    await this.notifyPaymentCreated(payload)
  }

  async notifyPaymentCreated(payload: TelegramPaymentCreatedPayload): Promise<void> {
    const merchantOrder = await this.merchantOrders.findOne({
      where: {
        id: payload.merchantOrderId,
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
      },
    })
    if (!merchantOrder) return
    const text = formatC2cCreatedMessage({
      merchantOrderId: merchantOrder.id,
      paymentOrderId: payload.paymentOrderId,
      platformOrderId: merchantOrder.platformOrderId,
      paymentNo: payload.paymentNo,
      fiatAmount: merchantOrder.fiatAmount,
      fiatCurrency: merchantOrder.fiatCurrency,
      asset: merchantOrder.asset,
      assetAmount: merchantOrder.assetAmount,
      payeeName: merchantOrder.payeeName ?? payload.payeeName,
      payeeIdentity: merchantOrder.payeeIdentity ?? payload.payeeIdentity,
      paymentMethod: merchantOrder.paymentMethod ?? payload.paymentMethod,
      identityName: merchantOrder.identityName,
      identityMatched: merchantOrder.identityMatched,
      status: payload.status,
      upstreamId: payload.upstreamId,
      errorMessage: payload.errorMessage,
    })
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.PAYMENT_STATUS,
      text,
      {
        inline_keyboard: [
          [
            { text: '查询订单', callback_data: `query:order:${payload.paymentOrderId}` },
            { text: '作废订单', callback_data: `c2c:cancel:${merchantOrder.id}` },
          ],
        ],
      },
    )
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_BATCH_STATUS)
  async onBatchStatus(payload: TelegramBatchStatusPayload): Promise<void> {
    await this.notifyBatchStatus(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_BATCH_SUBMITTED)
  async onBatchSubmitted(payload: TelegramBatchSubmittedPayload): Promise<void> {
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.BATCH_STATUS,
      formatAutomaticBatchSubmissionMessage(payload),
    )
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
    const reviewable = orders.filter((order) => shouldNotifyOrderDiscovered(order))
    await Promise.all(
      reviewable.map((order) =>
        this.sendToMerchantGroups(
          payload.tenantId,
          payload.merchantId,
          TelegramNotificationEvent.ORDER_DISCOVERED,
          formatOrderDiscoveredMessage(order),
          order.status === 'PENDING_PAYMENT'
            ? {
                inline_keyboard: [
                  [
                    { text: '确认下单', callback_data: `c2c:confirm:${order.id}` },
                    { text: '作废订单', callback_data: `c2c:cancel:${order.id}` },
                  ],
                ],
              }
            : undefined,
        ),
      ),
    )
  }

  async notifyPaymentStatus(payload: TelegramPaymentStatusPayload): Promise<void> {
    if (payload.notificationType === 'CREATED') return
    if (!shouldNotifyPaymentStatus(payload.status)) return
    const payment = await this.paymentOrders.findOne({
      where: {
        id: payload.paymentOrderId,
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
      },
    })
    if (!payment && !payload.paymentNo) return

    // pfa-pay reports a batch as one aggregate result. Never send one message
    // per child payment, otherwise a three-item batch produces four notices.
    if (this.paymentBatchItems) {
      const batchItem = await this.paymentBatchItems.findOne({
        where: {
          paymentOrderId: payload.paymentOrderId,
          tenantId: payload.tenantId,
          merchantId: payload.merchantId,
        },
      })
      if (batchItem) return
    }

    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.PAYMENT_STATUS,
      formatPaymentStatusMessage({
        paymentNo: payment?.paymentNo ?? payload.paymentNo ?? payload.paymentOrderId,
        sourceBusinessNo: payment?.sourceBusinessNo ?? payload.sourceBusinessNo,
        amount: payment?.amount,
        currency: payment?.currency,
        paymentMethod: payment?.paymentMethod,
        payeeName: payment?.payeeName,
        payeeIdentity: payment?.payeeIdentity,
        status: payload.status,
        upstreamId: payload.upstreamId,
        errorMessage: payload.errorMessage,
      }),
      payload.status === 'COMPLETED'
        ? {
            inline_keyboard: [
              [{ text: '获取回单', callback_data: `receipt:${payload.paymentOrderId}` }],
            ],
          }
        : undefined,
    )
  }

  async notifyBatchStatus(payload: TelegramBatchStatusPayload): Promise<void> {
    if (!shouldNotifyBatchStatus(payload.status)) return
    const batch = await this.paymentBatches.findOne({
      where: { id: payload.batchId, tenantId: payload.tenantId, merchantId: payload.merchantId },
    })
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.BATCH_STATUS,
      await this.buildBatchStatusMessage(payload, batch),
    )
  }

  async notifyException(payload: TelegramExceptionPayload): Promise<void> {
    const text = formatExceptionMessage(payload.code, payload.message, payload.referenceId)
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

  private async sumBatchAmount(
    payload: TelegramBatchStatusPayload,
    status: PaymentBatchItemStatus,
  ): Promise<string> {
    if (!this.paymentBatchItems) return '0'
    const items = await this.paymentBatchItems.find({
      where: {
        batchId: payload.batchId,
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
        status,
      },
    })
    return sumMoney(items.map((item) => item.amount))
  }

  private async buildBatchStatusMessage(
    payload: TelegramBatchStatusPayload,
    batch: PaymentBatchEntity | null,
  ): Promise<string> {
    if (!batch) {
      return formatBatchStatusMessage({
        batchNo: payload.batchNo || payload.batchId,
        status: payload.status,
        totalCount: payload.totalCount || 0,
        totalAmount: '0',
        successCount: payload.successCount || 0,
        successAmount: '0',
        failedCount: payload.failedCount || 0,
        failedAmount: '0',
      })
    }
    const [successAmount, failedAmount, failedDetails] = await Promise.all([
      this.sumBatchAmount(payload, PaymentBatchItemStatus.SUCCESS),
      this.sumBatchAmount(payload, PaymentBatchItemStatus.FAILED),
      this.formatFailedBatchDetails(payload, batch.currency),
    ])
    return formatBatchStatusMessage({
      batchNo: batch.batchNo,
      automatic: batch.triggerSource === 'AUTOMATIC',
      currency: batch.currency,
      status: payload.status,
      totalCount: batch.totalCount,
      totalAmount: batch.totalAmount,
      successCount: batch.successCount,
      successAmount,
      failedCount: batch.failedCount,
      failedAmount,
      failedDetails,
    })
  }

  private async formatFailedBatchDetails(
    payload: TelegramBatchStatusPayload,
    currency: string,
  ): Promise<string> {
    if (!this.paymentBatchItems) return ''
    const items = await this.paymentBatchItems.find({
      where: {
        batchId: payload.batchId,
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
        status: PaymentBatchItemStatus.FAILED,
      },
    })
    if (!items.length) return ''
    const payments = await this.paymentOrders.find({
      where: {
        id: In(items.map((item) => item.paymentOrderId)),
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
      },
    })
    const byId = new Map(payments.map((payment) => [payment.id, payment]))
    return items
      .slice(0, 20)
      .map((item) => {
        const payment = byId.get(item.paymentOrderId)
        return (
          `\n商家订单号：<code>${escapeTelegramHtml(payment?.sourceBusinessNo || item.paymentOrderId)}</code>` +
          `\n收款信息：<code>${escapeTelegramHtml([payment?.payeeName, payment?.payeeIdentity].filter(Boolean).join(' / ') || '未记录')}</code>` +
          `\n金额：<code>${escapeTelegramHtml(sumMoney([item.amount]))} ${escapeTelegramHtml(currency)}</code>` +
          `\n失败原因：<code>${escapeTelegramHtml(item.errorMessage || payment?.lastError || '未知错误')}</code>`
        )
      })
      .join('')
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
    const deliveries = groups
      .filter(
        (group) =>
          group.bindingState === TelegramGroupBindingState.ACTIVE &&
          group.notificationsEnabled &&
          Boolean(group.chatId) &&
          group.notificationEvents?.includes(event),
      )
      .map(async (group) => {
        const bot = await this.bots.findOne({
          where: { id: group.botId, tenantId: group.tenantId, status: BusinessStatus.ACTIVE },
          select: { id: true, tenantId: true, tokenRef: true, status: true },
        })
        if (!bot || !group.chatId) return
        try {
          await this.telegram.sendMessage({
            tokenRef: bot.tokenRef,
            chatId: group.chatId,
            text,
            parseMode: 'HTML',
            ...(replyMarkup ? { replyMarkup } : {}),
          })
        } catch (error) {
          this.logger.error(
            `Telegram 通知发送失败: group=${group.id}, event=${event}, error=${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })
    await Promise.all(deliveries)
  }
}
