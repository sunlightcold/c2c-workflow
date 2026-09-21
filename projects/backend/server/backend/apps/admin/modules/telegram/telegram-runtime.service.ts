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
import { TelegramC2cOrderActionService } from './telegram-c2c-order-action.service'
import { TelegramC2cAppealService } from './telegram-c2c-appeal.service'
import {
  parseTelegramPayoutCommand,
  type TelegramPayoutCommand,
} from './telegram-payout-command.parser'
import type { TelegramBotReply } from './telegram-query.formatter'
import { parseTelegramOtcCommand } from './telegram-otc-command.parser'
import { TelegramOtcService } from './telegram-otc.service'

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
  callbackQueryId?: string
  data: string
}

type StatisticsCommandKind = Extract<
  TelegramPayoutCommand,
  { kind: 'CURRENT_MONTH_STATISTICS' | 'STATISTICS' | 'YESTERDAY_STATISTICS' }
>['kind']

const commandCapabilities: Array<[TelegramCapability, string, string]> = [
  [
    TelegramCapability.ORDER_QUERY,
    '/query 订单号或批次号',
    '查询支付订单或批次（或发送：查单 订单号）',
  ],
  [TelegramCapability.RECEIPT_QUERY, '/receipt 订单号', '获取支付回单（或发送：回单 订单号）'],
  [
    TelegramCapability.PAYMENT_STATISTICS,
    '/stats',
    '查看今日支付统计（或发送：今日跑量/今日统计）',
  ],
  [TelegramCapability.PAYMENT_STATISTICS, '昨日统计', '查看昨日支付统计'],
  [TelegramCapability.PAYMENT_STATISTICS, '当月统计', '查看当月支付统计'],
  [
    TelegramCapability.PAYMENT_BATCH_SUBMIT,
    '/submitbatch',
    '提交待处理支付批次（或发送：提交/提交批次）',
  ],
  [TelegramCapability.C2C_APPEAL, '/appeal C2C订单号', '发起 C2C 订单申诉（或发送：申诉 订单号）'],
  [TelegramCapability.BOT_STATUS_MANAGE, '/status', '查看机器人和群组状态'],
  [TelegramCapability.OTC_CONFIG_MANAGE, '/otcconfig', '修改 OTC 行情查询配置'],
]

const otcPublicHelp = [
  'L/lz/lk/lw - 查询全部/支付宝/银行卡/微信报价',
  'z100/k100/w100 - 按人民币金额换算 USDT',
  '/otc [binance|okx|okx_block] [all|alipay|bank|wechat] [金额] - 查询行情',
  '直接发送四则表达式 - 使用高精度计算器',
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
    @Optional() private readonly c2cOrderActions?: TelegramC2cOrderActionService,
    @Optional() private readonly c2cAppeals?: TelegramC2cAppealService,
    @Optional() private readonly otc?: TelegramOtcService,
  ) {}

  // The runtime remains a compatibility facade while handlers are migrated into feature modules.
  // eslint-disable-next-line complexity
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
    const otcCommand = parseTelegramOtcCommand(message.text)
    if (otcCommand.kind === 'CALCULATOR' || otcCommand.kind === 'QUOTE') {
      await this.reply(
        bot.tokenRef,
        message,
        this.otc
          ? await this.otc.handlePublic(bot.tenantId, bot.id, message.chatId, otcCommand)
          : 'OTC 查询服务不可用',
      )
      return
    }
    // Ignore ordinary conversation and unknown slash commands. Authorization is
    // only relevant once the message has been recognized as a bot operation;
    // otherwise every chat message would receive a misleading permission error.
    const parsed = parseTelegramPayoutCommand(message.text)
    if (parsed.kind === 'UNKNOWN' && otcCommand.kind !== 'CONFIG') return
    if (command === '/myid') {
      await this.reply(bot.tokenRef, message, `您的 Telegram 用户编号：${message.userId}`)
      return
    }
    if (command === '/start') {
      await this.reply(bot.tokenRef, message, '机器人已启用\n发送 /help 查看可用命令。')
      return
    }
    if (command === '/bind') {
      await this.handleBindCommand(bot, message)
      return
    }
    if (command === '/help') {
      const isSuperAdmin =
        typeof this.authorization.canBindGroups === 'function' &&
        (await this.authorization.canBindGroups(bot.tenantId, message.userId))
      if (isSuperAdmin && message.chatType && ['group', 'supergroup'].includes(message.chatType)) {
        const existing = await this.authorization.authorize(bot, message.chatId, message.userId)
        if (!existing.allowed) {
          await this.reply(
            bot.tokenRef,
            message,
            [
              '可用命令：',
              '/myid - 查看 Telegram 用户编号',
              '/bind 平台商家编号 - 绑定当前商家群',
            ].join('\n'),
          )
          return
        }
      }
    }
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (!authorization.allowed) {
      if (command === '/help') {
        await this.reply(
          bot.tokenRef,
          message,
          ['公开命令：', '/help - 查看可用命令', ...otcPublicHelp].join('\n'),
        )
        return
      }
      await this.reply(
        bot.tokenRef,
        message,
        authorization.reason === 'CHAT_NOT_BOUND'
          ? '当前群尚未绑定商家，请机器人超级管理员发送：/bind 平台商家编号'
          : authorization.reason === 'MERCHANT_DISABLED'
            ? '当前群绑定的商家不可用或已停用，请联系管理员'
            : '您没有权限使用当前机器人',
      )
      return
    }
    if (otcCommand.kind === 'CONFIG') {
      await this.reply(
        bot.tokenRef,
        message,
        authorization.capabilities.includes(TelegramCapability.OTC_CONFIG_MANAGE)
          ? this.otc
            ? await this.otc.configReply(bot.tenantId, bot.id, message.chatId)
            : 'OTC 查询服务不可用'
          : '您没有修改 OTC 查询配置的权限',
      )
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
        await this.reply(bot.tokenRef, message, result)
      }
      return
    }
    const lines = commandCapabilities
      .filter(([capability]) => authorization.capabilities.includes(capability))
      .map(([, name, description]) => `${name} - ${description}`)
    if (authorization.capabilities.includes(TelegramCapability.C2C_DAILY_REPORT)) {
      lines.push('日报 [YYYYMMDD] - 查询 C2C 日报')
    }
    if (authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT)) {
      lines.push('发送四行订单信息 - 创建手工支付订单')
    }
    if (
      typeof this.authorization.canBindGroups === 'function' &&
      (await this.authorization.canBindGroups(bot.tenantId, message.userId))
    ) {
      lines.unshift('/bind 平台商家编号 - 绑定当前商家群')
    }
    await this.reply(
      bot.tokenRef,
      message,
      [
        '可用命令：',
        '/help - 查看可用命令',
        '/start - 启用机器人并查看帮助',
        '/myid - 查看 Telegram 用户编号',
        ...otcPublicHelp,
        ...lines,
      ].join('\n'),
    )
  }

  private async handleBindCommand(bot: TelegramBotEntity, message: TelegramTextMessage) {
    if (!message.chatType || !['group', 'supergroup'].includes(message.chatType)) {
      await this.reply(bot.tokenRef, message, '只能在群组中绑定商家')
      return
    }
    if (
      typeof this.authorization.canBindGroups !== 'function' ||
      !(await this.authorization.canBindGroups(bot.tenantId, message.userId))
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
      await this.reply(
        bot.tokenRef,
        message,
        error instanceof Error ? error.message : '商家群绑定失败',
      )
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
    const parsed = parseTelegramPayoutCommand(message.text)
    if (!message.text.startsWith('/')) {
      if (parsed.kind === 'QUERY') {
        await this.reply(
          bot.tokenRef,
          message,
          authorization.capabilities.includes(TelegramCapability.ORDER_QUERY)
            ? await this.queries.query(bot.tenantId, merchantId, parsed.argument, {
                canReceipt: authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY),
                canVoid: authorization.capabilities.includes(
                  TelegramCapability.ALIPAY_BATCH_PAYMENT,
                ),
              })
            : '您没有查询支付订单的权限',
        )
        return true
      }
      if (parsed.kind === 'RECEIPT') {
        await this.reply(
          bot.tokenRef,
          message,
          authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY)
            ? await this.queries.receipt(bot.tenantId, merchantId, parsed.argument)
            : '您没有获取支付回单的权限',
        )
        return true
      }
      if (isStatisticsCommand(parsed.kind)) {
        await this.handleStatisticsCommand(bot, message, authorization, parsed.kind)
        return true
      }
      if (parsed.kind === 'SUBMIT_BATCH') {
        const result = await this.batchPayments.prepare({ bot, authorization, message })
        await this.reply(bot.tokenRef, message, result)
        return true
      }
      if (parsed.kind === 'DAILY_REPORT') {
        await this.reply(
          bot.tokenRef,
          message,
          authorization.capabilities.includes(TelegramCapability.C2C_DAILY_REPORT)
            ? await this.queries.dailyReport(bot.tenantId, merchantId, parsed.argument)
            : '您没有查询 C2C 日报的权限',
        )
        return true
      }
      if (parsed.kind === 'APPEAL') {
        const result = this.c2cAppeals
          ? await this.c2cAppeals.prepare({
              bot,
              authorization,
              message,
              orderReference: parsed.argument,
            })
          : { text: 'C2C 申诉服务不可用' }
        await this.reply(bot.tokenRef, message, result)
        return true
      }
    }
    const responses: Record<
      string,
      () => Promise<TelegramBotReply | string> | TelegramBotReply | string
    > = {
      '/appeal': () =>
        this.c2cAppeals
          ? this.c2cAppeals.prepare({
              bot,
              authorization,
              message,
              orderReference: this.commandArgument(message.text),
            })
          : { text: 'C2C 申诉服务不可用' },
      '/query': () =>
        authorization.capabilities.includes(TelegramCapability.ORDER_QUERY)
          ? this.queries.query(bot.tenantId, merchantId, this.commandArgument(message.text), {
              canReceipt: authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY),
              canVoid: authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT),
            })
          : '您没有查询支付订单的权限',
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
      await this.reply(bot.tokenRef, message, result)
      return true
    }
    if (parsed.kind === 'DAILY_REPORT') {
      if (!authorization.capabilities.includes(TelegramCapability.C2C_DAILY_REPORT)) {
        await this.reply(bot.tokenRef, message, '您没有查询 C2C 日报的权限')
      } else {
        await this.reply(
          bot.tokenRef,
          message,
          await this.queries.dailyReport(bot.tenantId, merchantId, parsed.argument),
        )
      }
      return true
    }
    return false
  }

  private async handleStatisticsCommand(
    bot: TelegramBotEntity,
    message: TelegramTextMessage,
    authorization: Extract<
      Awaited<ReturnType<TelegramAuthorizationService['authorize']>>,
      { allowed: true }
    >,
    kind: StatisticsCommandKind,
  ): Promise<void> {
    if (!authorization.capabilities.includes(TelegramCapability.PAYMENT_STATISTICS)) {
      await this.reply(bot.tokenRef, message, '您没有查看支付统计的权限')
      return
    }
    const merchantId = authorization.group.merchantId
    const statistics =
      kind === 'YESTERDAY_STATISTICS'
        ? await this.queries.yesterdayStats(bot.tenantId, merchantId)
        : kind === 'CURRENT_MONTH_STATISTICS'
          ? await this.queries.currentMonthStats(bot.tenantId, merchantId)
          : await this.queries.todayStats(bot.tenantId, merchantId)
    await this.reply(bot.tokenRef, message, statistics)
  }

  // eslint-disable-next-line complexity
  private async handleCallback(bot: TelegramBotEntity, message: TelegramCallbackMessage) {
    if (message.data.startsWith('otc:')) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (
        !authorization.allowed ||
        !authorization.capabilities.includes(TelegramCapability.OTC_CONFIG_MANAGE)
      ) {
        await this.finishCallback(bot.tokenRef, message, '您没有修改 OTC 查询配置的权限', true)
        return
      }
      if (!this.otc) {
        await this.finishCallback(bot.tokenRef, message, 'OTC 查询服务不可用', true)
        return
      }
      try {
        const reply = await this.otc.applyConfigAction(
          bot.tenantId,
          bot.id,
          message.chatId,
          message.data,
        )
        await this.finishCallback(bot.tokenRef, message, '配置已更新', false, true)
        await this.reply(bot.tokenRef, message, reply)
      } catch (error) {
        const text = error instanceof Error ? error.message : 'OTC 配置更新失败'
        await this.finishCallback(bot.tokenRef, message, text.slice(0, 180), true)
      }
      return
    }
    const appealMatch = /^appeal:reason:([0-9a-f-]{36}):(\d+)$/i.exec(message.data)
    if (appealMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (
        !authorization.allowed ||
        !authorization.capabilities.includes(TelegramCapability.C2C_APPEAL)
      ) {
        await this.finishCallback(bot.tokenRef, message, '您没有权限提交申诉', true)
        return
      }
      if (!this.c2cAppeals) {
        await this.finishCallback(bot.tokenRef, message, 'C2C 申诉服务不可用', true)
        return
      }
      const result = await this.c2cAppeals.confirmReason({
        bot,
        authorization,
        message,
        interactionId: appealMatch[1],
        reasonCode: Number(appealMatch[2]),
      })
      const success = result.text.includes('申诉提交成功') && !result.text.includes('申诉失败')
      await this.finishCallback(
        bot.tokenRef,
        message,
        success ? '申诉已提交' : result.text.slice(0, 180),
        !success,
        true,
      )
      await this.reply(bot.tokenRef, message, result)
      return
    }
    const c2cMatch = /^c2c:(confirm|cancel):([0-9a-f-]{36})$/.exec(message.data)
    if (c2cMatch) {
      await this.handleC2cOrderCallback(
        bot,
        message,
        c2cMatch[1] as 'cancel' | 'confirm',
        c2cMatch[2],
      )
      return
    }
    const confirmPaidMatch = /^c2c:confirm-paid:([0-9a-f-]{36})$/i.exec(message.data)
    if (confirmPaidMatch) {
      await this.handleC2cConfirmPaidCallback(bot, message, confirmPaidMatch[1])
      return
    }
    const queryReceiptMatch = /^query:receipt:([0-9a-f-]{36})$/i.exec(message.data)
    if (queryReceiptMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (!authorization.allowed) {
        await this.finishCallback(bot.tokenRef, message, '您没有权限执行该操作', true)
        return
      }
      if (!authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY)) {
        await this.finishCallback(bot.tokenRef, message, '您没有获取回单的权限', true)
        return
      }
      const text = await this.queries.receipt(
        bot.tenantId,
        authorization.group.merchantId,
        queryReceiptMatch[1],
      )
      await this.finishCallback(bot.tokenRef, message, '查询完成', false, true)
      await this.reply(bot.tokenRef, message, text)
      return
    }
    const queryOrderMatch = /^query:order:([0-9a-f-]{36})$/i.exec(message.data)
    if (queryOrderMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (
        !authorization.allowed ||
        !authorization.capabilities.includes(TelegramCapability.ORDER_QUERY)
      ) {
        await this.finishCallback(bot.tokenRef, message, '您没有查询订单的权限', true)
        return
      }
      const result = await this.queries.queryById(
        bot.tenantId,
        authorization.group.merchantId,
        queryOrderMatch[1],
        {
          canReceipt: authorization.capabilities.includes(TelegramCapability.RECEIPT_QUERY),
          canVoid: authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT),
        },
      )
      await this.finishCallback(bot.tokenRef, message, '查询完成', false)
      await this.reply(bot.tokenRef, message, result)
      return
    }
    const queryVoidMatch = /^query:void:([0-9a-f-]{36})$/i.exec(message.data)
    if (queryVoidMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (
        !authorization.allowed ||
        !authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT)
      ) {
        await this.finishCallback(bot.tokenRef, message, '您没有权限作废该订单', true)
        return
      }
      try {
        const result = await this.queries.voidOrder(
          bot.tenantId,
          authorization.group.merchantId,
          queryVoidMatch[1],
        )
        await this.finishCallback(bot.tokenRef, message, '订单已作废', false, true)
        await this.reply(bot.tokenRef, message, result)
      } catch (error) {
        const text = error instanceof Error ? error.message : '订单作废失败'
        await this.finishCallback(bot.tokenRef, message, text.slice(0, 180), true)
        await this.reply(bot.tokenRef, message, `订单作废失败：${text}`)
      }
      return
    }
    const queryBatchMatch = /^query:batch:([^:]+):(\d+)$/i.exec(message.data)
    if (queryBatchMatch) {
      const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
      if (
        !authorization.allowed ||
        !authorization.capabilities.includes(TelegramCapability.ORDER_QUERY)
      ) {
        await this.finishCallback(bot.tokenRef, message, '您没有查询订单的权限', true)
        return
      }
      const result = await this.queries.queryBatch(
        bot.tenantId,
        authorization.group.merchantId,
        queryBatchMatch[1],
        Number(queryBatchMatch[2]),
      )
      await this.finishCallback(bot.tokenRef, message, '查询完成', false)
      await this.reply(bot.tokenRef, message, result)
      return
    }
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
      if (!authorization.capabilities.includes(TelegramCapability.PAYMENT_BATCH_SUBMIT)) {
        await this.finishCallback(bot.tokenRef, message, '您没有提交支付批次的权限', true)
        return
      }
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
      await this.reply(bot.tokenRef, message, result)
      return
    }
    if (!authorization.capabilities.includes(TelegramCapability.ALIPAY_BATCH_PAYMENT)) {
      await this.finishCallback(bot.tokenRef, message, '您没有创建支付订单的权限', true)
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
    await this.reply(bot.tokenRef, message, result)
  }

  private async handleC2cOrderCallback(
    bot: TelegramBotEntity,
    message: TelegramCallbackMessage,
    action: 'cancel' | 'confirm',
    orderId: string,
  ): Promise<void> {
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (
      !authorization.allowed ||
      !authorization.capabilities.includes(TelegramCapability.C2C_ORDER_PAYMENT)
    ) {
      await this.finishCallback(bot.tokenRef, message, '您没有权限执行该操作', true)
      return
    }
    if (!this.c2cOrderActions) {
      await this.finishCallback(bot.tokenRef, message, '商家订单操作服务不可用', true)
      return
    }
    try {
      const result = await this.c2cOrderActions[action]({
        tenantId: bot.tenantId,
        merchantId: authorization.group.merchantId,
        orderId,
        operator: `TG:${message.userId}`,
      })
      await this.finishCallback(
        bot.tokenRef,
        message,
        action === 'confirm' ? 'C2C订单已创建' : 'C2C订单已作废',
        false,
        true,
      )
      await this.reply(bot.tokenRef, message, result)
    } catch (error) {
      const text = error instanceof Error ? error.message : '商家订单操作失败'
      await this.finishCallback(bot.tokenRef, message, text.slice(0, 180), true)
      await this.reply(bot.tokenRef, message, `操作失败：${text}`)
    }
  }

  private async handleC2cConfirmPaidCallback(
    bot: TelegramBotEntity,
    message: TelegramCallbackMessage,
    orderId: string,
  ): Promise<void> {
    const authorization = await this.authorization.authorize(bot, message.chatId, message.userId)
    if (
      !authorization.allowed ||
      !authorization.capabilities.includes(TelegramCapability.C2C_ORDER_PAYMENT)
    ) {
      await this.finishCallback(bot.tokenRef, message, '您没有权限重试标记付款', true)
      return
    }
    if (!this.c2cOrderActions) {
      await this.finishCallback(bot.tokenRef, message, '商家订单操作服务不可用', true)
      return
    }
    try {
      const result = await this.c2cOrderActions.retryConfirmPaid({
        tenantId: bot.tenantId,
        merchantId: authorization.group.merchantId,
        orderId,
        operator: `TG:${message.userId}`,
      })
      const success = result.text.includes('标记付款成功')
      await this.finishCallback(
        bot.tokenRef,
        message,
        success ? '标记付款成功' : '标记付款仍失败',
        !success,
        success,
      )
      await this.reply(bot.tokenRef, message, result)
    } catch (error) {
      const text = error instanceof Error ? error.message : '重试标记付款失败'
      await this.finishCallback(bot.tokenRef, message, text.slice(0, 180), true)
      await this.reply(bot.tokenRef, message, `重试失败：${text}`)
    }
  }

  private async finishCallback(
    tokenRef: string,
    message: TelegramCallbackMessage,
    text: string,
    showAlert: boolean,
    clearKeyboard = false,
  ): Promise<void> {
    const effects: Promise<void>[] = []
    if (message.callbackQueryId && this.telegram.answerCallbackQuery) {
      effects.push(
        this.telegram.answerCallbackQuery({
          tokenRef,
          callbackQueryId: message.callbackQueryId,
          text,
          showAlert,
        }),
      )
    }
    if (clearKeyboard && this.telegram.editMessageReplyMarkup) {
      effects.push(
        this.telegram.editMessageReplyMarkup({
          tokenRef,
          chatId: message.chatId,
          messageId: message.messageId,
        }),
      )
    }
    await Promise.allSettled(effects)
  }

  private commandArgument(text: string): string {
    return text.split(/\s+/).slice(1).join(' ').trim()
  }

  private async reply(
    tokenRef: string,
    message: TelegramTextMessage,
    reply: string | TelegramBotReply,
    replyMarkup?: Record<string, unknown>,
  ): Promise<void> {
    const result = typeof reply === 'string' ? { text: reply } : reply
    if (result.photos?.length) {
      for (const [index, photo] of result.photos.entries()) {
        await this.telegram.sendPhoto({
          tokenRef,
          chatId: message.chatId,
          fileName: photo.fileName,
          photo: photo.content,
          ...(index === 0
            ? {
                caption: result.text,
                replyToMessageId: message.messageId,
                ...(result.parseMode ? { parseMode: result.parseMode } : {}),
                ...((replyMarkup ?? result.replyMarkup)
                  ? { replyMarkup: replyMarkup ?? result.replyMarkup }
                  : {}),
              }
            : {}),
        })
      }
      return
    }
    await this.telegram.sendMessage({
      tokenRef,
      chatId: message.chatId,
      replyToMessageId: message.messageId,
      text: result.text,
      ...(result.parseMode ? { parseMode: result.parseMode } : {}),
      ...((replyMarkup ?? result.replyMarkup)
        ? { replyMarkup: replyMarkup ?? result.replyMarkup }
        : {}),
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
      callbackQueryId: typeof record.id === 'string' ? record.id : undefined,
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

function isStatisticsCommand(kind: TelegramPayoutCommand['kind']): kind is StatisticsCommandKind {
  return (
    kind === 'STATISTICS' || kind === 'YESTERDAY_STATISTICS' || kind === 'CURRENT_MONTH_STATISTICS'
  )
}
