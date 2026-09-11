import {
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentSourceType,
  TelegramBotEntity,
  TelegramInteractionState,
} from '@admin/database'
import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PAYMENT_PLAN_RESOLVER,
  type PaymentPlanResolverPort,
} from '../payment/payment-plan-resolver'
import { sumCnyAmounts } from '../payment/payment-adapter.types'
import { PaymentOrderService } from '../payment/payment-order.service'
import type { TelegramAuthorizationResult } from './telegram-authorization.service'
import {
  parseTelegramManualPayments,
  type TelegramManualPaymentInput,
} from './telegram-message-parser'
import { TelegramCapability } from './telegram-policy'
import { TelegramInteractionService } from './telegram-interaction.service'

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

export interface TelegramManualPaymentReply {
  replyMarkup?: Record<string, unknown>
  text: string
}

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
      tenantId: input.bot.tenantId,
      botId: input.bot.id,
      groupId: input.authorization.group.id,
      chatId: input.message.chatId,
      telegramUserId: input.message.userId,
      sourceMessageId: input.message.messageId,
      payload: { payments: accepted },
    })
    return {
      text: [
        `待确认 ${accepted.length} 笔，合计 ${sumCnyAmounts(accepted.map(({ amount }) => amount))} CNY`,
        ...accepted.map(
          (payment, index) =>
            `${index + 1}. ${payment.sourceBusinessNo} | ${payment.amount} | ${payment.payeeName} | ${payment.payeeIdentity}`,
        ),
        ...errors,
      ].join('\n'),
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
    return this.interactions.cancel({
      id: input.interactionId,
      botId: input.bot.id,
      chatId: input.message.chatId,
      telegramUserId: input.message.userId,
    })
  }

  private canCreate(authorization: Extract<TelegramAuthorizationResult, { allowed: true }>) {
    return (
      authorization.group.paymentScene === PaymentSourceType.BOT_MANUAL &&
      authorization.capabilities.includes(TelegramCapability.MANUAL_PAYMENT)
    )
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
      routingKey: `${PaymentSourceType.BOT_MANUAL}:${payment.sourceBusinessNo}`,
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
    return {
      text: [
        `已创建 ${created.length} 笔支付订单`,
        ...created.map((order) => `${order.paymentNo}：${order.status}`),
        ...errors,
      ].join('\n'),
    }
  }
}
