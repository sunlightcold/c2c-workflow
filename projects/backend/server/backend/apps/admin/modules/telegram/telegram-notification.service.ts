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
  type TelegramBatchPlatformConfirmationResultPayload,
  type TelegramExceptionPayload,
  type TelegramOrderDiscoveredPayload,
  type TelegramPaymentCreatedPayload,
  type TelegramPaymentStatusPayload,
  type TelegramPlatformConfirmationFailedPayload,
} from '../event-emitter'
import { TelegramApiClient } from './telegram-api.client'
import {
  escapeTelegramHtml,
  formatBatchPlatformConfirmationFailureMessage,
  formatBatchStatusMessage,
  formatBatchPlatformConfirmationResultMessage,
  formatAutomaticBatchSubmissionMessage,
  formatC2cCreatedMessage,
  formatExceptionMessage,
  formatOrderDiscoveredMessage,
  formatPaymentStatusMessage,
  formatPlatformConfirmationFailedMessage,
  shouldNotifyBatchStatus,
  shouldNotifyOrderDiscovered,
  shouldNotifyPaymentStatus,
  sumMoney,
} from './telegram-notification.formatter'
import { TelegramCapability } from './telegram-policy'

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
      kycStatus: merchantOrder.kycStatus,
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
    const groups = await this.activeMerchantGroups(payload.tenantId, payload.merchantId)
    const deliveries = await this.sendGroups(
      groups,
      formatAutomaticBatchSubmissionMessage(payload),
      TelegramNotificationEvent.BATCH_STATUS,
    )
    if (payload.batchIds?.length && deliveries.length) {
      await this.paymentBatches.update(
        {
          id: In(payload.batchIds),
          tenantId: payload.tenantId,
          merchantId: payload.merchantId,
        },
        { telegramSubmissionMessages: deliveries },
      )
    }
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_EXCEPTION)
  async onException(payload: TelegramExceptionPayload): Promise<void> {
    await this.notifyException(payload)
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_PLATFORM_CONFIRMATION_FAILED)
  async onPlatformConfirmationFailed(
    payload: TelegramPlatformConfirmationFailedPayload,
  ): Promise<void> {
    const payment = await this.paymentOrders.findOne({
      where: {
        id: payload.paymentOrderId,
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
      },
    })
    if (!payment) return
    const merchantOrder = await this.merchantOrders.findOne({
      where: {
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
        platformOrderId: payment.sourceBusinessNo,
      },
    })
    if (!merchantOrder) return
    await this.sendToMerchantGroups(
      payload.tenantId,
      payload.merchantId,
      TelegramNotificationEvent.EXCEPTION,
      formatPlatformConfirmationFailedMessage({
        platformOrderId: merchantOrder.platformOrderId,
        paymentNo: payment.paymentNo,
        amount: payment.amount,
        currency: payment.currency,
        identityName: merchantOrder.identityName,
        payeeIdentity: merchantOrder.payeeIdentity,
        paymentMethod: merchantOrder.paymentMethod,
        reason: payload.errorMessage,
      }),
      {
        inline_keyboard: [
          [{ text: '重试', callback_data: `c2c:confirm-paid:${merchantOrder.id}` }],
        ],
      },
      undefined,
      true,
    )
  }

  @OnEvent(EVENT_KEYS.TELEGRAM_BATCH_PLATFORM_CONFIRMATION_RESULT)
  async onBatchPlatformConfirmationResult(
    payload: TelegramBatchPlatformConfirmationResultPayload,
  ): Promise<void> {
    if (!payload.items.length) return
    const failedOrderNumbers = payload.items
      .filter((item) => !item.success)
      .map((item) => item.sourceBusinessNo)
    const merchantOrders = failedOrderNumbers.length
      ? await this.merchantOrders.find({
          where: {
            tenantId: payload.tenantId,
            merchantId: payload.merchantId,
            platformOrderId: In(failedOrderNumbers),
          },
        })
      : []
    const merchantOrderByNumber = new Map(
      merchantOrders.map((order) => [order.platformOrderId, order.id]),
    )
    const keyboard = payload.items
      .filter((item) => !item.success)
      .flatMap((item) => {
        const merchantOrderId = merchantOrderByNumber.get(item.sourceBusinessNo)
        return merchantOrderId
          ? [
              [
                {
                  text: `重试 ${item.sourceBusinessNo}`,
                  callback_data: `c2c:confirm-paid:${merchantOrderId}`,
                },
              ],
            ]
          : []
      })
    const groups = await this.activeMerchantGroups(payload.tenantId, payload.merchantId)
    const notificationGroups = groups.filter((group) =>
      group.capabilities?.includes(TelegramCapability.C2C_PAID_NOTIFICATION),
    )
    const failureOnlyGroups = failedOrderNumbers.length
      ? groups.filter(
          (group) => !group.capabilities?.includes(TelegramCapability.C2C_PAID_NOTIFICATION),
        )
      : []
    const replyMarkup = keyboard.length ? { inline_keyboard: keyboard } : undefined
    await Promise.all([
      this.sendGroups(
        notificationGroups,
        formatBatchPlatformConfirmationResultMessage(payload),
        TelegramNotificationEvent.BATCH_STATUS,
        replyMarkup,
        undefined,
        true,
      ),
      this.sendGroups(
        failureOnlyGroups,
        formatBatchPlatformConfirmationFailureMessage(payload),
        TelegramNotificationEvent.EXCEPTION,
        replyMarkup,
        undefined,
        true,
      ),
    ])
  }

  async notifyOrderDiscovered(payload: TelegramOrderDiscoveredPayload): Promise<void> {
    if (!payload.orderIds.length) return
    const orders = await this.merchantOrders.find({
      where: {
        tenantId: payload.tenantId,
        merchantId: payload.merchantId,
        id: In(payload.orderIds),
      },
      select: {
        id: true,
        platformOrderId: true,
        fiatAmount: true,
        fiatCurrency: true,
        asset: true,
        assetAmount: true,
        status: true,
        payeeName: true,
        payeeIdentity: true,
        paymentMethod: true,
        identityName: true,
        identityMatched: true,
        payable: true,
        kycStatus: true,
        lastError: true,
      },
    })
    const reviewable = orders.filter(
      (order) => order.status === 'PENDING_PAYMENT' && shouldNotifyOrderDiscovered(order),
    )
    const otherNotifications = orders.filter(
      (order) => order.status !== 'PENDING_PAYMENT' && shouldNotifyOrderDiscovered(order),
    )
    const paymentBlocked = orders.filter(
      (order) => order.status === 'PENDING_PAYMENT' && !order.payable && order.lastError,
    )
    await Promise.all([
      ...reviewable.map((order) => this.notifyReviewableOrder(payload, order)),
      ...otherNotifications.map((order) =>
        this.sendToMerchantGroups(
          payload.tenantId,
          payload.merchantId,
          TelegramNotificationEvent.ORDER_DISCOVERED,
          formatOrderDiscoveredMessage(order),
        ),
      ),
      ...paymentBlocked.map((order) =>
        this.sendToMerchantGroups(
          payload.tenantId,
          payload.merchantId,
          TelegramNotificationEvent.EXCEPTION,
          formatExceptionMessage(
            'C2C_PAYMENT_ORDER_NOT_CREATED',
            order.lastError!,
            order.platformOrderId,
          ),
        ),
      ),
    ])
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
      payload.status === 'SUCCESS'
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
    const batchNo = batch?.batchNo ?? payload.batchNo ?? payload.batchId
    const groups = await this.activeMerchantGroups(payload.tenantId, payload.merchantId)
    const eligibleGroups = groups.filter((group) =>
      this.isGroupEligible(group, TelegramNotificationEvent.BATCH_STATUS),
    )
    if (!eligibleGroups.length) {
      this.logger.warn(
        `Telegram 批次结果通知跳过: batch=${batchNo}, status=${payload.status}, tenant=${payload.tenantId}, merchant=${payload.merchantId}, reason=没有可投递群组, activeGroups=${groups.length}`,
      )
      return
    }
    const deliveries = await this.sendGroups(
      eligibleGroups,
      await this.buildBatchStatusMessage(payload, batch),
      TelegramNotificationEvent.BATCH_STATUS,
      undefined,
      new Map(
        (batch?.telegramSubmissionMessages ?? []).map((item) => [item.groupId, item.messageId]),
      ),
    )
    if (deliveries.length) {
      this.logger.log(
        `Telegram 批次结果通知完成: batch=${batchNo}, status=${payload.status}, groups=${deliveries.length}/${eligibleGroups.length}`,
      )
      return
    }
    this.logger.warn(
      `Telegram 批次结果通知未送达: batch=${batchNo}, status=${payload.status}, eligibleGroups=${eligibleGroups.length}`,
    )
  }

  async notifyException(payload: TelegramExceptionPayload): Promise<void> {
    const text = formatExceptionMessage(payload.code, payload.message, payload.referenceId, {
      platform: payload.platform,
      merchantNo: payload.merchantNo,
    })
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

  private async notifyReviewableOrder(
    payload: TelegramOrderDiscoveredPayload,
    order: MerchantOrderEntity,
  ): Promise<void> {
    const groups = (await this.activeMerchantGroups(payload.tenantId, payload.merchantId)).filter(
      (group) =>
        group.tenantId === payload.tenantId &&
        group.merchantId === payload.merchantId &&
        group.capabilities?.includes(TelegramCapability.C2C_ORDER_PAYMENT),
    )
    const replyMarkup = {
      inline_keyboard: [
        [
          { text: '确认下单', callback_data: `c2c:confirm:${order.id}` },
          { text: '取消订单', callback_data: `c2c:cancel:${order.id}` },
        ],
      ],
    }
    for (const group of groups) {
      const deliveries = await this.sendGroups(
        [group],
        formatOrderDiscoveredMessage(order),
        TelegramNotificationEvent.ORDER_DISCOVERED,
        replyMarkup,
        undefined,
        true,
      )
      if (!deliveries.length) {
        this.logger.warn(
          `Telegram C2C 待审核订单未送达: order=${order.platformOrderId}, group=${group.id}, tenant=${payload.tenantId}, merchant=${payload.merchantId}`,
        )
        continue
      }
      this.logger.log(
        `Telegram C2C 待审核订单已送达: order=${order.platformOrderId}, group=${group.id}, tenant=${payload.tenantId}, merchant=${payload.merchantId}`,
      )
    }
    if (!groups.length) {
      this.logger.warn(
        `Telegram C2C 待审核订单未投递: order=${order.platformOrderId}, tenant=${payload.tenantId}, merchant=${payload.merchantId}, reason=没有已启用 C2C 支付能力的群组`,
      )
    }
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
    replyToByGroup?: Map<string, number>,
    bypassEventFilter = false,
  ): Promise<void> {
    const groups = await this.activeMerchantGroups(tenantId, merchantId)
    await this.sendGroups(
      groups.filter((group) => group.tenantId === tenantId && group.merchantId === merchantId),
      text,
      event,
      replyMarkup,
      replyToByGroup,
      bypassEventFilter,
    )
  }

  private activeMerchantGroups(tenantId: string, merchantId: string) {
    return this.groups.find({
      where: {
        tenantId,
        merchantId,
        bindingState: TelegramGroupBindingState.ACTIVE,
        notificationsEnabled: true,
      },
    })
  }

  private async sendGroups(
    groups: TelegramGroupEntity[],
    text: string,
    event: TelegramNotificationEvent,
    replyMarkup?: Record<string, unknown>,
    replyToByGroup?: Map<string, number>,
    bypassEventFilter = false,
  ): Promise<Array<{ groupId: string; messageId: number }>> {
    const deliveries = groups
      .filter((group) => this.isGroupEligible(group, event, bypassEventFilter))
      .map(async (group) => {
        const bot = await this.bots.findOne({
          where: { id: group.botId, tenantId: group.tenantId, status: BusinessStatus.ACTIVE },
          select: { id: true, tenantId: true, tokenRef: true, status: true, capabilities: true },
        })
        if (
          !bot ||
          !group.chatId ||
          (event === TelegramNotificationEvent.ORDER_DISCOVERED &&
            replyMarkup &&
            !bot.capabilities?.includes(TelegramCapability.C2C_ORDER_PAYMENT))
        ) {
          this.logger.warn(
            `Telegram 通知跳过: group=${group.id}, event=${event}, reason=${!bot ? '活动机器人不存在' : !group.chatId ? '群 Chat ID 为空' : '机器人未启用 C2C 支付能力'}, bot=${group.botId}`,
          )
          return undefined
        }
        try {
          const sent = await this.telegram.sendMessage({
            tokenRef: bot.tokenRef,
            chatId: group.chatId,
            text,
            parseMode: 'HTML',
            ...(replyMarkup ? { replyMarkup } : {}),
            ...(replyToByGroup?.get(group.id)
              ? { replyToMessageId: replyToByGroup.get(group.id) }
              : {}),
          })
          return { groupId: group.id, messageId: sent.messageId }
        } catch (error) {
          this.logger.error(
            `Telegram 通知发送失败: group=${group.id}, event=${event}, error=${error instanceof Error ? error.message : String(error)}`,
          )
          return undefined
        }
      })
    return (await Promise.all(deliveries)).filter(
      (item): item is { groupId: string; messageId: number } => Boolean(item),
    )
  }

  private isGroupEligible(
    group: TelegramGroupEntity,
    event: TelegramNotificationEvent,
    bypassEventFilter = false,
  ): boolean {
    return (
      group.bindingState === TelegramGroupBindingState.ACTIVE &&
      group.notificationsEnabled &&
      Boolean(group.chatId) &&
      (bypassEventFilter || group.notificationEvents?.includes(event))
    )
  }
}
