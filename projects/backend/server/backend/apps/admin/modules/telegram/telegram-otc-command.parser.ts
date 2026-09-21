import { TelegramOtcPaymentMethod, TelegramOtcRateSource } from './telegram-otc.types'

export type TelegramOtcCommand =
  | { kind: 'CALCULATOR'; expression: string }
  | { kind: 'CONFIG' }
  | {
      amount?: string
      kind: 'QUOTE'
      paymentMethod?: TelegramOtcPaymentMethod
      rateSource?: TelegramOtcRateSource
    }
  | { kind: 'UNKNOWN' }

const shortcutPayments: Record<string, TelegramOtcPaymentMethod> = {
  l: TelegramOtcPaymentMethod.ALL,
  lk: TelegramOtcPaymentMethod.BANK,
  lw: TelegramOtcPaymentMethod.WECHAT,
  lz: TelegramOtcPaymentMethod.ALIPAY,
}

const amountPayments: Record<string, TelegramOtcPaymentMethod> = {
  k: TelegramOtcPaymentMethod.BANK,
  w: TelegramOtcPaymentMethod.WECHAT,
  z: TelegramOtcPaymentMethod.ALIPAY,
}

export function parseTelegramOtcCommand(input: string): TelegramOtcCommand {
  const text = input.trim()
  if (!text) return { kind: 'UNKNOWN' }
  const command = text.toLowerCase()
  if (/^\/otcconfig(?:@[a-z0-9_]+)?$/i.test(text)) return { kind: 'CONFIG' }

  const shortcut = shortcutPayments[command]
  if (shortcut) return { kind: 'QUOTE', paymentMethod: shortcut }

  const amountShortcut = /^([zkw])\s*(\d+(?:\.\d+)?)$/i.exec(text)
  if (amountShortcut) {
    return {
      kind: 'QUOTE',
      paymentMethod: amountPayments[amountShortcut[1].toLowerCase()],
      amount: amountShortcut[2],
    }
  }

  const explicit = /^\/otc(?:@[a-z0-9_]+)?(?:\s+(.*))?$/i.exec(text)
  if (explicit) return parseExplicitQuote(explicit[1] ?? '')

  if (/^[\d\s().+*/-]+$/.test(text) && /[+*/-]/.test(text) && /\d/.test(text)) {
    return { kind: 'CALCULATOR', expression: text }
  }
  return { kind: 'UNKNOWN' }
}

function parseExplicitQuote(argumentsText: string): TelegramOtcCommand {
  const args = argumentsText.toLowerCase().split(/\s+/).filter(Boolean)
  let rateSource: TelegramOtcRateSource | undefined
  let paymentMethod: TelegramOtcPaymentMethod | undefined
  let amount: string | undefined
  const sources: Record<string, TelegramOtcRateSource> = {
    binance: TelegramOtcRateSource.BINANCE,
    okx: TelegramOtcRateSource.OKX,
    okx_block: TelegramOtcRateSource.OKX_BLOCK,
  }
  const payments: Record<string, TelegramOtcPaymentMethod> = {
    all: TelegramOtcPaymentMethod.ALL,
    alipay: TelegramOtcPaymentMethod.ALIPAY,
    bank: TelegramOtcPaymentMethod.BANK,
    wechat: TelegramOtcPaymentMethod.WECHAT,
  }
  for (const argument of args) {
    if (argument in sources && !rateSource) rateSource = sources[argument]
    else if (argument in payments && !paymentMethod) paymentMethod = payments[argument]
    else if (/^\d+(?:\.\d+)?$/.test(argument) && amount === undefined) amount = argument
    else return { kind: 'UNKNOWN' }
  }
  return {
    kind: 'QUOTE',
    ...(rateSource ? { rateSource } : {}),
    ...(paymentMethod ? { paymentMethod } : {}),
    ...(amount ? { amount } : {}),
  }
}
