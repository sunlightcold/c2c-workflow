import {
  PaymentBatchStatus,
  TelegramBotEntity,
  TelegramInteractionAction,
  TelegramInteractionState,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { sumCnyAmounts } from '../payment/payment-adapter.types'
import { PaymentBatchExecutionCoordinator } from '../payment/payment-batch-execution-coordinator'
import { PaymentBatchService } from '../payment/payment-batch.service'
import type { TelegramAuthorizationResult } from './telegram-authorization.service'
import { TelegramInteractionService } from './telegram-interaction.service'
import { TelegramCapability } from './telegram-policy'
import { escapeTelegramHtml } from './telegram-query.formatter'
import type { TelegramBotReply } from './telegram-query.formatter'

interface TelegramMessageIdentity {
  chatId: string
  messageId: number
  userId: string
}

interface BatchContext {
  authorization: Extract<TelegramAuthorizationResult, { allowed: true }>
  bot: Pick<TelegramBotEntity, 'batchSubmitRequireConfirmation' | 'id' | 'tenantId'>
  message: TelegramMessageIdentity
}

interface PaymentBatchGroup {
  paymentOrderIds: string[]
  totalAmount: string
}

export type TelegramBatchPaymentReply = TelegramBotReply

@Injectable()
export class TelegramBatchPaymentService {
  constructor(
    private readonly batches: PaymentBatchService,
    private readonly execution: PaymentBatchExecutionCoordinator,
    private readonly interactions: TelegramInteractionService,
  ) {}

  async prepare(context: BatchContext): Promise<TelegramBatchPaymentReply> {
    if (!this.canSubmit(context)) return { text: '您没有提交支付批次的权限' }
    const groups = await this.batches.findReadyGroups(
      context.bot.tenantId,
      context.authorization.group.merchantId,
    )
    if (!groups.length) return { text: '当前没有可提交的支付宝批量支付订单' }
    if (!context.bot.batchSubmitRequireConfirmation) return this.submitGroups(context, groups)

    const interaction = await this.interactions.create({
      action: TelegramInteractionAction.SUBMIT_PAYMENT_BATCHES,
      tenantId: context.bot.tenantId,
      botId: context.bot.id,
      groupId: context.authorization.group.id,
      chatId: context.message.chatId,
      telegramUserId: context.message.userId,
      sourceMessageId: context.message.messageId,
      payload: { groups },
    })
    return {
      parseMode: 'HTML',
      text:
        `<b>请确认提交批次</b>\n\n` +
        `待提交订单：<code>${groups.reduce((count, group) => count + group.paymentOrderIds.length, 0)}</code> 笔\n` +
        `批次组：<code>${groups.length}</code> 组\n` +
        `订单总金额：<code>¥${sumCnyAmounts(groups.map(({ totalAmount }) => totalAmount))}</code>`,
      replyMarkup: {
        inline_keyboard: [
          [
            { text: '确认提交', callback_data: `batch:confirm:${interaction.id}` },
            { text: '取消', callback_data: `batch:cancel:${interaction.id}` },
          ],
        ],
      },
    }
  }

  async confirm(
    context: BatchContext & { interactionId: string },
  ): Promise<TelegramBatchPaymentReply> {
    if (!this.canSubmit(context)) return { text: '您没有提交支付批次的权限' }
    const interaction = await this.interactions.acquire({
      action: TelegramInteractionAction.SUBMIT_PAYMENT_BATCHES,
      id: context.interactionId,
      botId: context.bot.id,
      chatId: context.message.chatId,
      telegramUserId: context.message.userId,
    })
    if (!interaction) return { text: '该批次确认已处理、已失效或不属于您' }
    if (interaction.groupId !== context.authorization.group.id) {
      await this.interactions.complete(
        interaction.id,
        TelegramInteractionState.FAILED,
        '群组绑定已变化',
      )
      return { text: '群组绑定已变化，请重新发起批次提交' }
    }
    const groups = (interaction.payload as { groups: PaymentBatchGroup[] }).groups
    return this.submitGroups(context, groups, interaction.id)
  }

  cancel(context: BatchContext & { interactionId: string }) {
    if (!this.canSubmit(context)) return Promise.resolve(false)
    return this.interactions.cancel({
      action: TelegramInteractionAction.SUBMIT_PAYMENT_BATCHES,
      id: context.interactionId,
      botId: context.bot.id,
      chatId: context.message.chatId,
      telegramUserId: context.message.userId,
    })
  }

  private canSubmit(context: BatchContext): boolean {
    return context.authorization.capabilities.includes(TelegramCapability.PAYMENT_BATCH_SUBMIT)
  }

  private async submitGroups(
    context: BatchContext,
    groups: PaymentBatchGroup[],
    interactionId?: string,
  ): Promise<TelegramBatchPaymentReply> {
    const results: string[] = []
    const errors: string[] = []
    for (const [index, group] of groups.entries()) {
      try {
        const { batch } = await this.batches.create(context.bot.tenantId, group.paymentOrderIds)
        const submitted = await this.execution.submit(context.bot.tenantId, batch.id)
        results.push(`${submitted.batchNo}：${this.batchStatus(submitted.status)}`)
      } catch (error) {
        errors.push(`第 ${index + 1} 组：${error instanceof Error ? error.message : '提交失败'}`)
      }
    }
    if (interactionId) {
      await this.interactions.complete(
        interactionId,
        results.length ? TelegramInteractionState.COMPLETED : TelegramInteractionState.FAILED,
        errors.length ? errors.join('; ').slice(0, 500) : null,
      )
    }
    const count = groups.reduce((total, group) => total + group.paymentOrderIds.length, 0)
    const totalAmount = sumCnyAmounts(groups.map(({ totalAmount: amount }) => amount))
    return {
      parseMode: 'HTML' as const,
      text: [
        `<b>批次提交结果</b>`,
        '',
        `本次提交订单：<code>${count}</code> 笔`,
        `订单总金额：<code>¥${totalAmount}</code>`,
        `发现批次组：<code>${groups.length}</code>`,
        `已提交批次：<code>${results.length}</code>`,
        `失败批次：<code>${errors.length}</code>`,
        ...(errors.length
          ? [`失败原因：`, ...errors.map((item) => `- ${escapeTelegramHtml(item)}`)]
          : []),
      ].join('\n'),
    }
  }

  private batchStatus(status: PaymentBatchStatus): string {
    if (status === PaymentBatchStatus.SUCCESS) return '支付成功'
    if (status === PaymentBatchStatus.PARTIAL_SUCCESS) return '部分成功'
    if (status === PaymentBatchStatus.FAILED) return '支付失败'
    if (status === PaymentBatchStatus.UNKNOWN) return '结果未知'
    return '处理中'
  }
}
