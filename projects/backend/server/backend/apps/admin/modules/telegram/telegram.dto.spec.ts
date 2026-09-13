import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { CreateTelegramBotDto } from './telegram.dto'

describe('CreateTelegramBotDto', () => {
  it('accepts a raw Telegram Bot Token instead of an internal token reference', async () => {
    const dto = plainToInstance(CreateTelegramBotDto, {
      name: '支付机器人',
      botType: 'PAYMENT',
      token: '8929220627:AAabcdefghijklmnopQRST',
      capabilities: ['ORDER_QUERY'],
    })

    await expect(validate(dto)).resolves.toEqual([])
  })
})
