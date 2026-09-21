import { TelegramOtcConfigEntity } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Big from 'big.js'
import { Repository } from 'typeorm'
import { calculateTelegramOtcExpression } from './telegram-otc-calculator'
import type { TelegramOtcCommand } from './telegram-otc-command.parser'
import { TelegramOtcMarketService } from './telegram-otc-market.service'
import {
  TelegramOtcConfigView,
  TelegramOtcPaymentMethod,
  TelegramOtcQuote,
  TelegramOtcRateSource,
} from './telegram-otc.types'
import type { TelegramBotReply } from './telegram-query.formatter'

const sourceLabels: Record<TelegramOtcRateSource, string> = {
  BINANCE: '币安普通交易',
  OKX: '欧易普通交易',
  OKX_BLOCK: '欧易大宗交易',
}

const paymentLabels: Record<TelegramOtcPaymentMethod, string> = {
  ALL: '全部',
  ALIPAY: '支付宝',
  BANK: '银行卡',
  WECHAT: '微信',
}

@Injectable()
export class TelegramOtcService {
  constructor(
    @InjectRepository(TelegramOtcConfigEntity)
    private readonly configs: Repository<TelegramOtcConfigEntity>,
    private readonly market: TelegramOtcMarketService,
  ) {}

  async handlePublic(
    tenantId: string,
    botId: string,
    chatId: string,
    command: Exclude<TelegramOtcCommand, { kind: 'CONFIG' | 'UNKNOWN' }>,
  ): Promise<TelegramBotReply> {
    if (command.kind === 'CALCULATOR') {
      try {
        return {
          text: `${command.expression} = ${calculateTelegramOtcExpression(command.expression)}`,
        }
      } catch (error) {
        return { text: `计算失败：${error instanceof Error ? error.message : '表达式无效'}` }
      }
    }
    try {
      const quote = await this.quote(tenantId, botId, chatId, {
        paymentMethod: command.paymentMethod,
        rateSource: command.rateSource,
      })
      let text = this.renderAds(quote)
      if (command.amount !== undefined) text += this.renderConversion(command.amount, quote)
      return { text, parseMode: 'HTML' }
    } catch (error) {
      return { text: `行情查询失败：${error instanceof Error ? error.message : '未知错误'}` }
    }
  }

  async configReply(tenantId: string, botId: string, chatId: string): Promise<TelegramBotReply> {
    const config = await this.getConfig(tenantId, botId, chatId)
    return {
      text: this.renderConfig(config),
      parseMode: 'HTML',
      replyMarkup: this.configKeyboard(config),
    }
  }

  async applyConfigAction(
    tenantId: string,
    botId: string,
    chatId: string,
    callbackData: string,
  ): Promise<TelegramBotReply> {
    const config = await this.getConfig(tenantId, botId, chatId)
    const [, action, value] = callbackData.split(':')
    if (action === 'source' && Object.values(TelegramOtcRateSource).includes(value as never)) {
      config.rateSource = value as TelegramOtcRateSource
    } else if (
      action === 'payment' &&
      Object.values(TelegramOtcPaymentMethod).includes(value as never)
    ) {
      config.paymentMethod = value as TelegramOtcPaymentMethod
    } else if (action === 'rank' && /^([1-9]|10)$/.test(value ?? '')) {
      config.priceRank = Number(value)
    } else if (action === 'adjust-reset') {
      config.rateAdjustment = '0'
    } else if (action === 'adjust' && /^-?(?:0\.01|0\.1)$/.test(value ?? '')) {
      config.rateAdjustment = new Big(config.rateAdjustment).plus(value).toString()
    } else {
      throw new Error('不支持的 OTC 配置操作')
    }
    await this.configs.update(
      { tenantId, botId, chatId },
      {
        paymentMethod: config.paymentMethod,
        priceRank: config.priceRank,
        rateAdjustment: config.rateAdjustment,
        rateSource: config.rateSource,
      },
    )
    return {
      text: this.renderConfig(config),
      parseMode: 'HTML',
      replyMarkup: this.configKeyboard(config),
    }
  }

  private async quote(
    tenantId: string,
    botId: string,
    chatId: string,
    override: {
      paymentMethod?: TelegramOtcPaymentMethod
      rateSource?: TelegramOtcRateSource
    },
  ): Promise<TelegramOtcQuote> {
    const config = await this.getConfig(tenantId, botId, chatId)
    if (override.rateSource) config.rateSource = override.rateSource
    const paymentMethod = override.paymentMethod ?? config.paymentMethod
    const ads = await this.market.listAds({ rateSource: config.rateSource, paymentMethod })
    const selected = ads[config.priceRank - 1]
    if (!selected) throw new Error(`当前仅有 ${ads.length} 档报价，第 ${config.priceRank} 档不可用`)
    const effectiveRate = new Big(selected.price).plus(config.rateAdjustment)
    if (effectiveRate.lte(0)) throw new Error('微调后的有效汇率必须大于 0')
    return { ads, config, effectiveRate: effectiveRate.toString(), paymentMethod, selected }
  }

  private async getConfig(
    tenantId: string,
    botId: string,
    chatId: string,
  ): Promise<TelegramOtcConfigView> {
    let entity = await this.configs.findOneBy({ tenantId, botId, chatId })
    if (!entity) {
      try {
        entity = await this.configs.save(
          this.configs.create({
            tenantId,
            botId,
            chatId,
            rateSource: TelegramOtcRateSource.OKX_BLOCK,
            paymentMethod: TelegramOtcPaymentMethod.ALL,
            priceRank: 3,
            rateAdjustment: '0',
          }),
        )
      } catch (error) {
        entity = await this.configs.findOneBy({ tenantId, botId, chatId })
        if (!entity) throw error
      }
    }
    return {
      tenantId: entity.tenantId,
      botId: entity.botId,
      chatId: entity.chatId,
      rateSource: entity.rateSource as TelegramOtcRateSource,
      paymentMethod: entity.paymentMethod as TelegramOtcPaymentMethod,
      priceRank: entity.priceRank,
      rateAdjustment: new Big(entity.rateAdjustment).toString(),
    }
  }

  private renderAds(quote: TelegramOtcQuote): string {
    const lines = quote.ads.map(
      (ad, index) =>
        `${index + 1 === quote.config.priceRank ? '▶' : '·'} <code>${html(ad.price)}</code>  ${html(ad.merchantName)}`,
    )
    return [
      '<b>OTC 商家实时价格</b>',
      `筛选：${html(paymentLabels[quote.paymentMethod])} ${html(sourceLabels[quote.config.rateSource])}`,
      '',
      ...lines,
    ].join('\n')
  }

  private renderConversion(amountText: string, quote: TelegramOtcQuote): string {
    if (!/^\d+(?:\.\d+)?$/.test(amountText)) throw new Error('金额格式错误')
    const amount = new Big(amountText)
    if (amount.lt(0) || amount.gt('1000000000000')) throw new Error('金额超过允许范围')
    const usdt = amount.div(quote.effectiveRate)
    const adjustment = new Big(quote.config.rateAdjustment)
    const adjustmentText = adjustment.gte(0)
      ? `+ ${formatNumber(adjustment.toString())}`
      : `- ${formatNumber(adjustment.abs().toString())}`
    return [
      '',
      `汇率：<code>${html(quote.selected.price)}</code>（第${quote.config.priceRank}档） ${adjustmentText} = <code>${html(quote.effectiveRate)}</code>`,
      `<b>币数</b>：（${formatNumber(amount.toString(), 2)} ÷ ${html(quote.effectiveRate)}）= <code>${formatNumber(usdt.toString(), 8)} USDT</code>`,
    ].join('\n')
  }

  private renderConfig(config: TelegramOtcConfigView): string {
    return [
      '<b>OTC 查询配置</b>',
      '',
      `数据来源：<code>${html(sourceLabels[config.rateSource])}</code>`,
      `默认支付方式：<code>${html(paymentLabels[config.paymentMethod])}</code>`,
      `报价档位：<code>第 ${config.priceRank} 档</code>`,
      `价格微调：<code>${html(config.rateAdjustment)}</code>`,
      '',
      '<i>按钮修改后立即生效，只影响本机器人当前群组的后续查询。</i>',
    ].join('\n')
  }

  private configKeyboard(config: TelegramOtcConfigView): {
    inline_keyboard: Array<Array<{ callback_data: string; text: string }>>
  } {
    const checked = (active: boolean, label: string) => `${active ? '✓ ' : ''}${label}`
    return {
      inline_keyboard: [
        [
          {
            text: checked(config.rateSource === TelegramOtcRateSource.BINANCE, '币安'),
            callback_data: 'otc:source:BINANCE',
          },
          {
            text: checked(config.rateSource === TelegramOtcRateSource.OKX, '欧易'),
            callback_data: 'otc:source:OKX',
          },
          {
            text: checked(config.rateSource === TelegramOtcRateSource.OKX_BLOCK, '欧易大宗'),
            callback_data: 'otc:source:OKX_BLOCK',
          },
        ],
        Object.values(TelegramOtcPaymentMethod).map((paymentMethod) => ({
          text: checked(config.paymentMethod === paymentMethod, paymentLabels[paymentMethod]),
          callback_data: `otc:payment:${paymentMethod}`,
        })),
        ...Array.from({ length: 10 }, (_, index) => index + 1).reduce<
          Array<Array<{ callback_data: string; text: string }>>
        >((rows, rank, index) => {
          if (index % 5 === 0) rows.push([])
          rows.at(-1)?.push({
            text: checked(config.priceRank === rank, `${rank}档`),
            callback_data: `otc:rank:${rank}`,
          })
          return rows
        }, []),
        [
          { text: '-0.10', callback_data: 'otc:adjust:-0.1' },
          { text: '-0.01', callback_data: 'otc:adjust:-0.01' },
          { text: '归零', callback_data: 'otc:adjust-reset' },
          { text: '+0.01', callback_data: 'otc:adjust:0.01' },
          { text: '+0.10', callback_data: 'otc:adjust:0.1' },
        ],
      ],
    }
  }
}

function formatNumber(value: string, max = 8): string {
  return new Big(value).toFixed(max).replace(/\.?0+$/, '') || '0'
}

function html(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
