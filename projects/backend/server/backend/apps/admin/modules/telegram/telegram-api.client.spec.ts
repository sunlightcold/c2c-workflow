import axios from 'axios'
import { ServiceUnavailableException } from '@nestjs/common'
import { TelegramApiClient } from './telegram-api.client'

describe('TelegramApiClient', () => {
  const token = ['123456', 'telegram-test-token'].join(':')

  beforeEach(() => {
    process.env.TG_TEST_TOKEN = token
    jest.restoreAllMocks()
  })

  afterAll(() => delete process.env.TG_TEST_TOKEN)

  it('sends messages only through the fixed Telegram Bot API endpoint', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } })
    const client = new TelegramApiClient()

    await client.sendMessage({
      tokenRef: 'env://TG_TEST_TOKEN',
      chatId: '-1001',
      replyToMessageId: 9,
      text: '测试消息',
    })

    expect(post).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id: '-1001',
        text: '测试消息',
        reply_parameters: { allow_sending_without_reply: true, message_id: 9 },
      },
      { timeout: 10_000 },
    )
  })

  it('returns a sanitized error when Telegram rejects the request', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('request contains secret token'))
    const client = new TelegramApiClient()

    await expect(
      client.sendMessage({
        tokenRef: 'env://TG_TEST_TOKEN',
        chatId: '-1001',
        text: '测试消息',
      }),
    ).rejects.toEqual(new ServiceUnavailableException('Telegram 消息发送失败'))
  })

  it('decrypts encrypted bot token references before calling Telegram', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true } })
    const cipher = { decrypt: jest.fn().mockReturnValue(token) }
    const client = new TelegramApiClient(cipher as never)

    await client.sendMessage({
      tokenRef: 'enc://ciphertext',
      chatId: '-1001',
      text: '测试消息',
    })

    expect(cipher.decrypt).toHaveBeenCalledWith('ciphertext')
    expect(post).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${token}/sendMessage`,
      { chat_id: '-1001', text: '测试消息' },
      { timeout: 10_000 },
    )
  })
})
