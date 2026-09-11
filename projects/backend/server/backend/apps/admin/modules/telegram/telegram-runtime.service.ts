import { BusinessStatus, TelegramBotEntity } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TelegramApiClient } from './telegram-api.client'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramCapability } from './telegram-policy'
import { TelegramManualPaymentService } from './telegram-manual-payment.service'

interface TelegramUpdateInput {
  botId: string
  payload: Record<string, unknown>
  tenantId: string
}

interface TelegramTextMessage {
  chatId: string
  messageId: number
  text: string
  userId: string
}

interface TelegramCallbackMessage extends TelegramTextMessage {
  data: string
}

const commandCapabilities: Array<[TelegramCapability, string, string]> = [
  [TelegramCapability.ORDER_QUERY, '/query', '查询支付订单或批次'],
  [TelegramCapability.BALANCE_QUERY, '/balance', '查询支付账号余额'],
  [TelegramCapability.RECEIPT_QUERY, '/receipt', '获取支付回单'],
  [TelegramCapability.PAYMENT_STATISTICS, '/stats', '查看今日支付统计'],
  [TelegramCapability.PAYMENT_BATCH_SUBMIT, '/submitbatch', '提交待处理支付批次'],
  [TelegramCapability.C2C_APPEAL, '/appeal', '发起 C2C 订单申诉'],
  [TelegramCapability.BOT_STATUS_MANAGE, '/status', '查看机器人状态'],
]

@Injectable()
export class TelegramRuntimeService {
  constructor(
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    private readonly authorization: TelegramAuthorizationService,
    private readonly telegram: TelegramApiClient,
    private readonly manualPayments: TelegramManualPaymentService,
  ) {}

  async handle(update: TelegramUpdateInput): Promise<void> {
    const bot = await this.bots
      .createQueryBuilder('bot')
      .addSelect('bot.tokenRef')
      .where('bot.id = :botId AND bot."tenantId" = :tenantId AND bot.status = :status', {
        botId: update.botId,
        tenantId: update.tenantId,
        status: BusinessStatus.ACTIVE,
      })
      .getOne()
    if (!bot) return

    const callback = this.readCallbackMessage(update.payload)
    if (callback) {
      await this.handleCallback(bot, callback)
      return
    }
    const message = this.readTextMessage(update.payload)
    if (!message) return

    const command = message.text.split(/\s+/, 1)[0]?.split('@', 1)[0]?.toLowerCase()
    if (command === '/myid') {
      await this.reply(bot.tokenRef, message, `您的 Telegram 用户编号：${message.userId}`)
      return
    }
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (!authorization.allowed) {
      await this.reply(bot.tokenRef, message, '您没有权限使用当前机器人')
      return
    }
    if (command !== '/help') {
      if (message.text.includes('\n')) {
        const result = await this.manualPayments.prepare({
          bot,
          authorization,
          message,
          text: message.text,
        })
        await this.reply(bot.tokenRef, message, result.text, result.replyMarkup)
      }
      return
    }
    const lines = commandCapabilities
      .filter(([capability]) => authorization.capabilities.includes(capability))
      .map(([, name, description]) => `${name} - ${description}`)
    await this.reply(
      bot.tokenRef,
      message,
      ['可用命令：', '/myid - 查看 Telegram 用户编号', ...lines].join('\n'),
    )
  }

  private async handleCallback(bot: TelegramBotEntity, message: TelegramCallbackMessage) {
    const match = /^payment:(confirm|cancel):([0-9a-f-]{36})$/.exec(message.data)
    if (!match) return
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (!authorization.allowed) {
      await this.reply(bot.tokenRef, message, '您没有权限执行该操作')
      return
    }
    const [, action, interactionId] = match
    if (action === 'cancel') {
      const cancelled = await this.manualPayments.cancel({
        interactionId,
        bot,
        authorization,
        message,
      })
      await this.reply(
        bot.tokenRef,
        message,
        cancelled ? '已取消，本次未创建支付订单' : '该确认已处理或已失效',
      )
      return
    }
    const result = await this.manualPayments.confirm({
      interactionId,
      bot,
      authorization,
      message,
    })
    await this.reply(bot.tokenRef, message, result.text)
  }

  private reply(
    tokenRef: string,
    message: TelegramTextMessage,
    text: string,
    replyMarkup?: Record<string, unknown>,
  ) {
    return this.telegram.sendMessage({
      tokenRef,
      chatId: message.chatId,
      replyToMessageId: message.messageId,
      text,
      ...(replyMarkup ? { replyMarkup } : {}),
    })
  }

  private readCallbackMessage(payload: Record<string, unknown>): TelegramCallbackMessage | null {
    const callback = payload.callback_query
    if (!callback || typeof callback !== 'object') return null
    const record = callback as Record<string, unknown>
    const message = record.message as Record<string, unknown> | undefined
    const chat = message?.chat as Record<string, unknown> | undefined
    const from = record.from as Record<string, unknown> | undefined
    if (
      typeof record.data !== 'string' ||
      typeof message?.message_id !== 'number' ||
      typeof chat?.id !== 'number' ||
      typeof from?.id !== 'number'
    ) {
      return null
    }
    return {
      chatId: String(chat.id),
      data: record.data,
      messageId: message.message_id,
      text: record.data,
      userId: String(from.id),
    }
  }

  private readTextMessage(payload: Record<string, unknown>): TelegramTextMessage | null {
    const message = payload.message
    if (!message || typeof message !== 'object') return null
    const record = message as Record<string, unknown>
    const chat = record.chat as Record<string, unknown> | undefined
    const from = record.from as Record<string, unknown> | undefined
    if (
      typeof record.text !== 'string' ||
      typeof record.message_id !== 'number' ||
      typeof chat?.id !== 'number' ||
      typeof from?.id !== 'number'
    ) {
      return null
    }
    return {
      chatId: String(chat.id),
      messageId: record.message_id,
      text: record.text.trim(),
      userId: String(from.id),
    }
  }
}
