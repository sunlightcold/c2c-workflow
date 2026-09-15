import {
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentSourceType,
  TelegramBotEntity,
  TelegramInteractionAction,
  TelegramInteractionState,
} from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PAYMENT_PLAN_RESOLVER,
  type PaymentPlanResolverPort,
} from '../payment/payment-plan-resolver'
import { PaymentOrderService } from '../payment/payment-order.service'
import type { TelegramAuthorizationResult } from './telegram-authorization.service'
import {
  parseTelegramManualPayments,
  type TelegramManualPaymentInput,
} from './telegram-message-parser'
import { TelegramCapability } from './telegram-policy'
import { TelegramInteractionService } from './telegram-interaction.service'
import type { TelegramBotReply } from './telegram-query.formatter'
import {
  formatManualPaymentAcceptedMessage,
  formatManualPaymentConfirmation,
} from './telegram-notification.formatter'
import { escapeTelegramHtml } from './telegram-query.formatter'

interface TelegramMessageIdentity {
  chatId: string
  messageId: number
  userId: string
}

interface ManualPaymentContext {
  authorization: Extract<TelegramAuthorizationResult, { allowed: true }>
  bot: Pick<TelegramBotEntity, 'id' | 'paymentOrderRequireConfirmation' | 'tenantId'>
  message: TelegramMessageIdentity
}

export type TelegramManualPaymentReply = TelegramBotReply

@Injectable()
export class TelegramManualPaymentService {
  constructor(
    @Inject(PAYMENT_PLAN_RESOLVER)
    private readonly plans: PaymentPlanResolverPort,
    @InjectRepository(PaymentOrderEntity)
    private readonly paymentOrders: Repository<PaymentOrderEntity>,
    private readonly orders: PaymentOrderService,
    private readonly interactions: TelegramInteractionService,
  ) {}

  async prepare(
    input: ManualPaymentContext & { text: string },
  ): Promise<TelegramManualPaymentReply> {
    if (!this.canCreate(input.authorization)) return { text: '您没有创建支付订单的权限' }
    const parsed = parseTelegramManualPayments(input.text)
    const accepted: TelegramManualPaymentInput[] = []
    const errors: string[] = []

    for (const item of parsed) {
      if (!item.input) {
        errors.push(`第 ${item.index} 笔：${item.error}`)
        continue
      }
      const error = await this.validatePayment(input, item.input)
      if (error) errors.push(`第 ${item.index} 笔：${error}`)
      else accepted.push(item.input)
    }
    if (!accepted.length) return { text: ['没有可创建的支付订单', ...errors].join('\n') }

    if (!input.bot.paymentOrderRequireConfirmation) {
      return this.createPayments(input, accepted, errors)
    }
    const interaction = await this.interactions.create({
      action: TelegramInteractionAction.CREATE_MANUAL_PAYMENTS,
      tenantId: input.bot.tenantId,
      botId: input.bot.id,
      groupId: input.authorization.group.id,
      chatId: input.message.chatId,
      telegramUserId: input.message.userId,
      sourceMessageId: input.message.messageId,
      payload: { payments: accepted },
    })
    return {
      parseMode: 'HTML',
      text: formatManualPaymentConfirmation(accepted),
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '确认下单', callback_data: `payment:confirm:${interaction.id}` },
            { text: '取消', callback_data: `payment:cancel:${interaction.id}` },
          ],
        ],
      },
    }
  }

  async confirm(
    input: ManualPaymentContext & { interactionId: string },
  ): Promise<TelegramManualPaymentReply> {
    if (!this.canCreate(input.authorization)) return { text: '您没有创建支付订单的权限' }
    const interaction = await this.interactions.acquire({
      action: TelegramInteractionAction.CREATE_MANUAL_PAYMENTS,
      id: input.interactionId,
      botId: input.bot.id,
      chatId: input.message.chatId,
      telegramUserId: input.message.userId,
    })
    if (!interaction) return { text: '该确认已处理、已失效或不属于您' }
    if (interaction.groupId !== input.authorization.group.id) {
      await this.interactions.complete(
        interaction.id,
        TelegramInteractionState.FAILED,
        '群组绑定已变化',
      )
      return { text: '群组绑定已变化，请重新提交支付信息' }
    }
    const payments = (interaction.payload as { payments: TelegramManualPaymentInput[] }).payments
    return this.createPayments(input, payments, [], interaction.id)
  }

  cancel(input: ManualPaymentContext & { interactionId: string }) {
    if (!this.canCreate(input.authorization)) return Promise.resolve(false)
    return this.interactions.cancel({
      action: TelegramInteractionAction.CREATE_MANUAL_PAYMENTS,
      id: input.interactionId,
      botId: input.bot.id,
      chatId: input.message.chatId,
      telegramUserId: input.message.userId,
    })
  }

  private canCreate(authorization: Extract<TelegramAuthorizationResult, { allowed: true }>) {
    return authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT)
  }

  private async validatePayment(
    context: ManualPaymentContext,
    payment: TelegramManualPaymentInput,
  ): Promise<string | null> {
    const existing = await this.paymentOrders.findOne({
      where: {
        tenantId: context.bot.tenantId,
        merchantId: context.authorization.group.merchantId,
        sourceType: PaymentSourceType.BOT_MANUAL,
        sourceBusinessNo: payment.sourceBusinessNo,
      },
    })
    if (existing) return '商户订单号已存在'
    const route = await this.plans.resolve({
      tenantId: context.bot.tenantId,
      merchantId: context.authorization.group.merchantId,
      scene: PaymentSourceType.BOT_MANUAL,
      currency: 'CNY',
      amount: payment.amount,
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.BATCH,
      routingKey: payment.sourceBusinessNo,
    })
    return route ? null : '未匹配到可用的支付宝批量支付方案'
  }

  private async createPayments(
    context: ManualPaymentContext,
    payments: TelegramManualPaymentInput[],
    priorErrors: string[],
    interactionId?: string,
  ): Promise<TelegramManualPaymentReply> {
    const created: PaymentOrderEntity[] = []
    const errors = [...priorErrors]
    for (const [index, payment] of payments.entries()) {
      try {
        created.push(
          await this.orders.create(context.bot.tenantId, {
            merchantId: context.authorization.group.merchantId,
            sourceType: PaymentSourceType.BOT_MANUAL,
            sourceBusinessNo: payment.sourceBusinessNo,
            amount: payment.amount,
            currency: 'CNY',
            paymentMethod: 'ALIPAY',
            executionMode: PaymentExecutionMode.BATCH,
            payeeIdentity: payment.payeeIdentity,
            payeeName: payment.payeeName,
          }),
        )
      } catch (error) {
        errors.push(`第 ${index + 1} 笔：${error instanceof Error ? error.message : '创建失败'}`)
      }
    }
    if (interactionId) {
      await this.interactions.complete(
        interactionId,
        TelegramInteractionState.COMPLETED,
        errors.length ? errors.join('; ').slice(0, 500) : null,
      )
    }
    const actionButtons = created.flatMap((order) => {
      const buttons: Array<{ text: string; callback_data: string }> = [
        { text: '查询订单', callback_data: `query:order:${order.id}` },
      ]
      if (['PENDING_CONFIG', 'CREATED', 'READY'].includes(order.status)) {
        buttons.push({ text: '作废订单', callback_data: `query:void:${order.id}` })
      }
      return buttons
    })
    return {
      parseMode: 'HTML' as const,
      text:
        [
          ...created.map((order) =>
            formatManualPaymentAcceptedMessage({
              id: order.id,
              paymentNo: order.paymentNo,
              sourceBusinessNo: order.sourceBusinessNo,
              amount: order.amount,
              payeeName: order.payeeName,
              payeeIdentity: order.payeeIdentity,
              status: order.status,
            }),
          ),
          ...errors.map((item) => `<b>订单提交失败</b>\n${escapeTelegramHtml(item)}`),
        ].join('\n\n') || '<b>订单提交失败</b>',
      ...(actionButtons.length ? { replyMarkup: { inline_keyboard: [actionButtons] } } : {}),
    }
  }
}
