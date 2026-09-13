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

  it('supports Telegram connectivity checks and long polling through fixed endpoints', async () => {
    const post = jest
      .spyOn(axios, 'post')
      .mockResolvedValueOnce({ data: { ok: true, result: { id: 1001, username: 'payment_bot' } } })
      .mockResolvedValueOnce({ data: { ok: true, result: true } })
      .mockResolvedValueOnce({ data: { ok: true, result: [{ update_id: 42 }] } })
    const client = new TelegramApiClient()

    await expect(client.getMe('env://TG_TEST_TOKEN')).resolves.toEqual({
      id: 1001,
      username: 'payment_bot',
    })
    await client.deleteWebhook('env://TG_TEST_TOKEN')
    await expect(client.getUpdates('env://TG_TEST_TOKEN', 42)).resolves.toEqual([{ update_id: 42 }])

    expect(post).toHaveBeenNthCalledWith(
      1,
      `https://api.telegram.org/bot${token}/getMe`,
      undefined,
      { timeout: 10_000 },
    )
    expect(post).toHaveBeenNthCalledWith(
      3,
      `https://api.telegram.org/bot${token}/getUpdates`,
      expect.objectContaining({ offset: 42, timeout: 25 }),
      { timeout: 35_000 },
    )
  })

  it('passes an abort signal to Telegram long polling', async () => {
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { ok: true, result: [] } })
    const client = new TelegramApiClient()
    const controller = new AbortController()

    await client.getUpdates('env://TG_TEST_TOKEN', 9, controller.signal)

    expect(post).toHaveBeenCalledWith(
      `https://api.telegram.org/bot${token}/getUpdates`,
      expect.objectContaining({ offset: 9 }),
      { signal: controller.signal, timeout: 35_000 },
    )
  })

  it.each([
    [401, 'Telegram Token 无效或已失效'],
    [409, 'Telegram 长轮询被其他实例占用'],
  ])('preserves actionable Telegram API errors for status reporting', async (status, message) => {
    jest.spyOn(axios, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { status },
    })
    const client = new TelegramApiClient()

    await expect(client.getMe('env://TG_TEST_TOKEN')).rejects.toEqual(
      new ServiceUnavailableException(message),
    )
  })

  it('reports network failures without exposing request details', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue({
      code: 'ECONNABORTED',
      isAxiosError: true,
      message: `request to bot${token} timed out`,
    })
    const client = new TelegramApiClient()

    await expect(client.getMe('env://TG_TEST_TOKEN')).rejects.toEqual(
      new ServiceUnavailableException('Telegram 网络连接失败'),
    )
  })
})
