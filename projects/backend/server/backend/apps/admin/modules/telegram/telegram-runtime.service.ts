import { BusinessStatus, TelegramBotEntity } from '@admin/database'
import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TelegramApiClient } from './telegram-api.client'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramCapability } from './telegram-policy'
import { TelegramManualPaymentService } from './telegram-manual-payment.service'
import { TelegramBatchPaymentService } from './telegram-batch-payment.service'
import { TelegramQueryService } from './telegram-query.service'
import { TelegramGroupService } from './telegram-group.service'

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
  chatType?: string
  chatName?: string | null
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
    private readonly batchPayments: TelegramBatchPaymentService,
    private readonly queries: TelegramQueryService,
    @Optional() private readonly groups?: TelegramGroupService,
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
    if (command === '/bind') {
      await this.handleBindCommand(bot, message)
      return
    }
    if (command === '/help') {
      const isSuperAdmin =
        typeof this.authorization.isActiveSuperAdmin === 'function' &&
        (await this.authorization.isActiveSuperAdmin(bot.tenantId, message.userId))
      if (isSuperAdmin && message.chatType && ['group', 'supergroup'].includes(message.chatType)) {
        const existing = await this.authorization.authorize(bot, message.chatId, message.userId)
        if (!existing.allowed) {
          await this.reply(
            bot.tokenRef,
            message,
            ['可用命令：', '/myid - 查看 Telegram 用户编号', '/bind 平台商家编号 - 绑定当前商家群'].join('\n'),
          )
          return
        }
      }
    }
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (!authorization.allowed) {
      await this.reply(bot.tokenRef, message, '您没有权限使用当前机器人')
      return
    }
    if (await this.handleAuthorizedCommand(bot, message, authorization, command)) return
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
    if (
      typeof this.authorization.isActiveSuperAdmin === 'function' &&
      (await this.authorization.isActiveSuperAdmin(bot.tenantId, message.userId))
    ) {
      lines.unshift('/bind 平台商家编号 - 绑定当前商家群')
    }
    await this.reply(
      bot.tokenRef,
      message,
      ['可用命令：', '/myid - 查看 Telegram 用户编号', ...lines].join('\n'),
    )
  }

  private async handleBindCommand(bot: TelegramBotEntity, message: TelegramTextMessage) {
    if (!message.chatType || !['group', 'supergroup'].includes(message.chatType)) {
      await this.reply(bot.tokenRef, message, '只能在群组中绑定商家')
      return
    }
    if (
      typeof this.authorization.isActiveSuperAdmin !== 'function' ||
      !(await this.authorization.isActiveSuperAdmin(bot.tenantId, message.userId))
    ) {
      await this.reply(bot.tokenRef, message, '只有机器人超级管理员可以绑定商家群')
      return
    }
    const args = message.text.split(/\s+/).slice(1).filter(Boolean)
    if (args.length !== 1) {
      await this.reply(bot.tokenRef, message, '用法：/bind 平台商家编号')
      return
    }
    try {
      if (!this.groups) throw new Error('群组绑定服务不可用')
      await this.groups.bindByMerchant({
        tenantId: bot.tenantId,
        botId: bot.id,
        merchantCode: args[0],
        chatId: message.chatId,
        chatType: message.chatType,
        chatName: message.chatName,
      })
      const groupName = message.chatName?.trim() || `当前群组（${message.chatId}）`
      await this.reply(
        bot.tokenRef,
        message,
        `商家群绑定成功\n平台商家编号：${args[0]}\n群组：${groupName}\n发送 /help 查看可用命令`,
      )
    } catch (error) {
      await this.reply(bot.tokenRef, message, error instanceof Error ? error.message : '商家群绑定失败')
    }
  }

  private async handleAuthorizedCommand(
    bot: TelegramBotEntity,
    message: TelegramTextMessage,
    authorization: Extract<
      Awaited<ReturnType<TelegramAuthorizationService['authorize']>>,
      { allowed: true }
    >,
    command: string,
  ): Promise<boolean> {
    const merchantId = authorization.group?.merchantId ?? ''
    const responses: Record<string, () => Promise<string> | string> = {
      '/query': () =>
        authorization.capabilities.includes(TelegramCapability.ORDER_QUERY)
          ? this.queries.query(bot.tenantId, merchantId, this.commandArgument(message.text))
          : '您没有查询支付订单的权限',
      '/balance': () =>
        authorization.capabilities.includes(TelegramCapability.BALANCE_QUERY)
          ? this.queries.balance(bot.tenantId, merchantId)
          : '您没有查询支付账号余额的权限',
      '/receipt': () =>
        authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY)
          ? this.queries.receipt(bot.tenantId, merchantId, this.commandArgument(message.text))
          : '您没有获取支付回单的权限',
      '/stats': () =>
        authorization.capabilities.includes(TelegramCapability.PAYMENT_STATISTICS)
          ? this.queries.todayStats(bot.tenantId, merchantId)
          : '您没有查看支付统计的权限',
      '/status': () =>
        authorization.capabilities.includes(TelegramCapability.BOT_STATUS_MANAGE)
          ? this.queries.status(bot.code, authorization.group?.name ?? '')
          : '您没有查看机器人状态的权限',
    }
    if (command in responses) {
      await this.reply(bot.tokenRef, message, await responses[command]())
      return true
    }
    if (command === '/submitbatch') {
      const result = await this.batchPayments.prepare({ bot, authorization, message })
      await this.reply(bot.tokenRef, message, result.text, result.replyMarkup)
      return true
    }
    return false
  }

  private async handleCallback(bot: TelegramBotEntity, message: TelegramCallbackMessage) {
    const receiptMatch = /^receipt:([0-9a-f-]{36})$/.exec(message.data)
    if (receiptMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (!authorization.allowed) {
        await this.reply(bot.tokenRef, message, '您没有权限执行该操作')
        return
      }
      const text = authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY)
        ? await this.queries.receipt(bot.tenantId, authorization.group.merchantId, receiptMatch[1])
        : '您没有获取支付回单的权限'
      await this.reply(bot.tokenRef, message, text)
      return
    }
    const match = /^(payment|batch):(confirm|cancel):([0-9a-f-]{36})$/.exec(message.data)
    if (!match) return
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (!authorization.allowed) {
      await this.reply(bot.tokenRef, message, '您没有权限执行该操作')
      return
    }
    const [, type, action, interactionId] = match
    if (type === 'batch') {
      if (action === 'cancel') {
        const cancelled = await this.batchPayments.cancel({
          interactionId,
          bot,
          authorization,
          message,
        })
        await this.reply(
          bot.tokenRef,
          message,
          cancelled ? '已取消，本次未提交支付批次' : '该批次确认已处理或已失效',
        )
        return
      }
      const result = await this.batchPayments.confirm({
        interactionId,
        bot,
        authorization,
        message,
      })
      await this.reply(bot.tokenRef, message, result.text)
      return
    }
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

  private commandArgument(text: string): string {
    return text.split(/\s+/).slice(1).join(' ').trim()
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
      chatType: typeof chat.type === 'string' ? chat.type : undefined,
      chatName: typeof chat.title === 'string' ? chat.title : null,
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
      chatType: typeof chat.type === 'string' ? chat.type : undefined,
      chatName: typeof chat.title === 'string' ? chat.title : null,
    }
  }
}
