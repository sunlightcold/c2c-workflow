import { parseTelegramOtcCommand } from './telegram-otc-command.parser'
import { TelegramOtcPaymentMethod, TelegramOtcRateSource } from './telegram-otc.types'

describe('parseTelegramOtcCommand', () => {
  it.each([
    ['L', TelegramOtcPaymentMethod.ALL],
    ['lz', TelegramOtcPaymentMethod.ALIPAY],
    ['lk', TelegramOtcPaymentMethod.BANK],
    ['lw', TelegramOtcPaymentMethod.WECHAT],
  ])('parses %s as a quote shortcut', (text, paymentMethod) => {
    expect(parseTelegramOtcCommand(text)).toEqual({ kind: 'QUOTE', paymentMethod })
  })

  it.each([
    ['z100', TelegramOtcPaymentMethod.ALIPAY, '100'],
    ['k 100.50', TelegramOtcPaymentMethod.BANK, '100.50'],
    ['w0', TelegramOtcPaymentMethod.WECHAT, '0'],
  ])('parses %s as a fiat conversion', (text, paymentMethod, amount) => {
    expect(parseTelegramOtcCommand(text)).toEqual({ kind: 'QUOTE', paymentMethod, amount })
  })

  it('parses an explicit source, payment method and amount', () => {
    expect(parseTelegramOtcCommand('/otc okx_block bank 100')).toEqual({
      kind: 'QUOTE',
      rateSource: TelegramOtcRateSource.OKX_BLOCK,
      paymentMethod: TelegramOtcPaymentMethod.BANK,
      amount: '100',
    })
  })

  it('keeps configuration and calculator commands distinct', () => {
    expect(parseTelegramOtcCommand('/otcconfig')).toEqual({ kind: 'CONFIG' })
    expect(parseTelegramOtcCommand('(2 + 3) * 4')).toEqual({
      kind: 'CALCULATOR',
      expression: '(2 + 3) * 4',
    })
    expect(parseTelegramOtcCommand('普通聊天内容')).toEqual({ kind: 'UNKNOWN' })
  })
})
