import {
  MerchantOrderEntity,
  TelegramBotEntity,
  TelegramInteractionAction,
  TelegramInteractionState,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { C2cOrderAppealService } from '../c2c-order/c2c-order-appeal.service'
import { TelegramInteractionService } from './telegram-interaction.service'
import { TelegramCapability } from './telegram-policy'
import type { TelegramBotReply } from './telegram-query.formatter'
import { escapeTelegramHtml } from './telegram-query.formatter'

interface TelegramMessageIdentity {
  chatId: string
  messageId: number
  userId: string
}

interface AppealContext {
  authorization: {
    capabilities: TelegramCapability[]
    group: { id: string; merchantId: string }
  }
  bot: Pick<TelegramBotEntity, 'id' | 'tenantId'>
  message: TelegramMessageIdentity
}

export type TelegramC2cAppealReply = TelegramBotReply

const DEFAULT_REASON_CODE = 1

@Injectable()
export class TelegramC2cAppealService {
  constructor(
    @InjectRepository(MerchantOrderEntity)
    private readonly orders: Repository<MerchantOrderEntity>,
    private readonly appeals: C2cOrderAppealService,
    private readonly interactions: TelegramInteractionService,
  ) {}

  async prepare(
    context: AppealContext & { orderReference: string },
  ): Promise<TelegramC2cAppealReply> {
    if (!this.canAppeal(context)) return { text: '您没有提交 C2C 申诉的权限' }
    const reference = context.orderReference.trim()
    if (!reference) return { text: '用法：/appeal 币安订单号' }

    try {
      const order = await this.findOrder(context, reference)
      const result = await this.appeals.getReasons(
        context.bot.tenantId,
        context.authorization.group.merchantId,
        order.id,
      )
      const defaultReason = result.reasons.find(
        ({ reasonCode }) => reasonCode === DEFAULT_REASON_CODE,
      )
      if (defaultReason) return this.submit(context, order.id, defaultReason.reasonCode)

      const interaction = await this.interactions.create({
        action: TelegramInteractionAction.C2C_APPEAL_REASON,
        tenantId: context.bot.tenantId,
        botId: context.bot.id,
        groupId: context.authorization.group.id,
        chatId: context.message.chatId,
        telegramUserId: context.message.userId,
        sourceMessageId: context.message.messageId,
        payload: { orderId: order.id },
      })
      return {
        text: `币安当前未返回默认申诉原因，请选择 ${result.orderNo} 的申诉原因：`,
        replyMarkup: {
          inline_keyboard: result.reasons.map((reason) => [
            {
              text: reason.reasonDesc,
              callback_data: `appeal:reason:${interaction.id}:${reason.reasonCode}`,
            },
          ]),
        },
      }
    } catch (error) {
      return {
        parseMode: 'HTML',
        text: `🔴 <b>申诉失败</b>\n\n原因：<code>${escapeTelegramHtml(this.errorMessage(error))}</code>`,
      }
    }
  }

  async confirmReason(
    context: AppealContext & { interactionId: string; reasonCode: number },
  ): Promise<TelegramC2cAppealReply> {
    if (!this.canAppeal(context)) return { text: '您没有提交 C2C 申诉的权限' }
    const interaction = await this.interactions.acquire({
      action: TelegramInteractionAction.C2C_APPEAL_REASON,
      id: context.interactionId,
      botId: context.bot.id,
      chatId: context.message.chatId,
      telegramUserId: context.message.userId,
    })
    if (!interaction) return { text: '该申诉选择已处理、已失效或不属于您' }
    if (interaction.groupId !== context.authorization.group.id) {
      await this.interactions.complete(
        interaction.id,
        TelegramInteractionState.FAILED,
        '群组绑定已变化',
      )
      return { text: '群组绑定已变化，请重新发起申诉' }
    }

    const orderId = (interaction.payload as { orderId?: unknown }).orderId
    if (typeof orderId !== 'string') {
      await this.interactions.complete(
        interaction.id,
        TelegramInteractionState.FAILED,
        '申诉上下文无效',
      )
      return { text: '申诉上下文无效，请重新发起申诉' }
    }
    const result = await this.submit(context, orderId, context.reasonCode)
    const succeeded = result.text.includes('申诉提交成功') && !result.text.includes('申诉失败')
    await this.interactions.complete(
      interaction.id,
      succeeded ? TelegramInteractionState.COMPLETED : TelegramInteractionState.FAILED,
      succeeded ? null : result.text.slice(0, 500),
    )
    return result
  }

  private async submit(
    context: AppealContext,
    orderId: string,
    reasonCode: number,
  ): Promise<TelegramC2cAppealReply> {
    try {
      const result = await this.appeals.submit(
        context.bot.tenantId,
        context.authorization.group.merchantId,
        orderId,
        { reasonCode },
      )
      return {
        parseMode: 'HTML',
        text: [
          '🟢 <b>申诉提交成功</b>',
          '',
          '<b>申诉信息</b>',
          `币安订单号：<code>${escapeTelegramHtml(result.orderNo)}</code>`,
          `申诉原因：<code>${escapeTelegramHtml(result.reason)}</code>`,
          `申诉单号：<code>${escapeTelegramHtml(result.complaintNo)}</code>`,
        ].join('\n'),
      }
    } catch (error) {
      return {
        parseMode: 'HTML',
        text: `🔴 <b>申诉失败</b>\n\n原因：<code>${escapeTelegramHtml(this.errorMessage(error))}</code>`,
      }
    }
  }

  private async findOrder(context: AppealContext, reference: string) {
    const scope = {
      tenantId: context.bot.tenantId,
      merchantId: context.authorization.group.merchantId,
    }
    const order = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reference,
    )
      ? await this.orders.findOne({
          where: [
            { ...scope, id: reference },
            { ...scope, platformOrderId: reference },
          ],
        })
      : await this.orders.findOne({ where: { ...scope, platformOrderId: reference } })
    if (!order) throw new Error('未查询到当前商家的币安订单')
    return order
  }

  private canAppeal(context: AppealContext): boolean {
    return context.authorization.capabilities.includes(TelegramCapability.C2C_APPEAL)
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 500)
  }
}
