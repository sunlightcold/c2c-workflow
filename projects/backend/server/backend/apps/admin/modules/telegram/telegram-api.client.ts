import axios from 'axios'
import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'

const SEND_MESSAGE_MAX_ATTEMPTS = 3
const SEND_MESSAGE_RETRY_DELAYS_MS = [500, 1_000]

export interface TelegramSendMessageInput {
  chatId: string
  parseMode?: 'HTML' | 'MarkdownV2'
  replyMarkup?: Record<string, unknown>
  replyToMessageId?: number
  text: string
  tokenRef: string
}

export interface TelegramSendPhotoInput {
  caption?: string
  chatId: string
  fileName: string
  parseMode?: 'HTML' | 'MarkdownV2'
  photo: Buffer
  replyMarkup?: Record<string, unknown>
  replyToMessageId?: number
  tokenRef: string
}

export interface TelegramBotProfile {
  id: number
  username?: string
}

export interface TelegramCallbackAnswerInput {
  callbackQueryId: string
  showAlert?: boolean
  text?: string
  tokenRef: string
}

export interface TelegramEditReplyMarkupInput {
  chatId: string
  messageId: number
  replyMarkup?: Record<string, unknown>
  tokenRef: string
}

export interface TelegramUpdatePage {
  update_id: number
  [key: string]: unknown
}

@Injectable()
export class TelegramApiClient {
  constructor(@Optional() private readonly cipher?: CredentialCipherService) {}

  async sendMessage(input: TelegramSendMessageInput): Promise<{ messageId: number }> {
    const token = this.resolveToken(input.tokenRef)
    const body = {
      chat_id: input.chatId,
      text: input.text,
      ...(input.parseMode ? { parse_mode: input.parseMode } : {}),
      ...(input.replyToMessageId
        ? {
            reply_parameters: {
              allow_sending_without_reply: true,
              message_id: input.replyToMessageId,
            },
          }
        : {}),
      ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
    }

    for (let attempt = 1; attempt <= SEND_MESSAGE_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await axios.post<{
          ok: boolean
          result?: { message_id?: number }
          error_code?: number
          description?: string
        }>(`https://api.telegram.org/bot${token}/sendMessage`, body, { timeout: 10_000 })
        const messageId = response.data.result?.message_id
        if (!response.data.ok || typeof messageId !== 'number' || !Number.isInteger(messageId)) {
          throw new Error('Telegram API rejected message')
        }
        return { messageId }
      } catch (error) {
        if (attempt >= SEND_MESSAGE_MAX_ATTEMPTS || !this.isTransientSendError(error)) {
          throw new ServiceUnavailableException(this.sendMessageErrorMessage(error))
        }
        await this.sleep(this.sendRetryDelay(attempt, error))
      }
    }

    throw new ServiceUnavailableException('Telegram 消息发送失败')
  }

  async sendPhoto(input: TelegramSendPhotoInput): Promise<void> {
    const token = this.resolveToken(input.tokenRef)
    const form = new FormData()
    form.append('chat_id', input.chatId)
    form.append(
      'photo',
      new Blob([new Uint8Array(input.photo)], { type: 'image/jpeg' }),
      input.fileName,
    )
    if (input.caption) form.append('caption', input.caption)
    if (input.parseMode) form.append('parse_mode', input.parseMode)
    if (input.replyToMessageId) {
      form.append(
        'reply_parameters',
        JSON.stringify({
          allow_sending_without_reply: true,
          message_id: input.replyToMessageId,
        }),
      )
    }
    if (input.replyMarkup) form.append('reply_markup', JSON.stringify(input.replyMarkup))

    try {
      const response = await axios.post<{ ok: boolean }>(
        `https://api.telegram.org/bot${token}/sendPhoto`,
        form,
        { timeout: 30_000 },
      )
      if (!response.data.ok) throw new Error('Telegram API rejected photo')
    } catch {
      throw new ServiceUnavailableException('Telegram 图片发送失败')
    }
  }

  async getMe(tokenRef: string): Promise<TelegramBotProfile> {
    return this.call<TelegramBotProfile>(tokenRef, 'getMe')
  }

  async answerCallbackQuery(input: TelegramCallbackAnswerInput): Promise<void> {
    await this.call(input.tokenRef, 'answerCallbackQuery', {
      callback_query_id: input.callbackQueryId,
      ...(input.text ? { text: input.text } : {}),
      ...(input.showAlert ? { show_alert: true } : {}),
    })
  }

  async editMessageReplyMarkup(input: TelegramEditReplyMarkupInput): Promise<void> {
    await this.call(input.tokenRef, 'editMessageReplyMarkup', {
      chat_id: input.chatId,
      message_id: input.messageId,
      reply_markup: input.replyMarkup ?? { inline_keyboard: [] },
    })
  }

  async getUpdates(
    tokenRef: string,
    offset?: number,
    signal?: AbortSignal,
  ): Promise<TelegramUpdatePage[]> {
    return this.call<TelegramUpdatePage[]>(
      tokenRef,
      'getUpdates',
      {
        timeout: 25,
        ...(offset === undefined ? {} : { offset }),
        allowed_updates: ['message', 'callback_query', 'my_chat_member'],
      },
      signal,
    )
  }

  async deleteWebhook(tokenRef: string): Promise<void> {
    await this.call<{ ok: boolean }>(tokenRef, 'deleteWebhook', { drop_pending_updates: false })
  }

  private async call<T>(
    tokenRef: string,
    method: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<T> {
    const token = this.resolveToken(tokenRef)
    try {
      const response = await axios.post<{ ok: boolean; result: T }>(
        `https://api.telegram.org/bot${token}/${method}`,
        body,
        {
          timeout: method === 'getUpdates' ? 35_000 : 10_000,
          ...(signal ? { signal } : {}),
        },
      )
      if (!response.data.ok) throw new Error('Telegram API rejected request')
      return response.data.result
    } catch (error) {
      throw new ServiceUnavailableException(this.requestErrorMessage(error))
    }
  }

  private resolveToken(reference: string): string {
    if (reference.startsWith('enc://')) {
      if (!this.cipher) throw new ServiceUnavailableException('Telegram Token 未配置')
      try {
        const token = this.cipher.decrypt(reference.slice('enc://'.length)).trim()
        if (!token) throw new Error('empty token')
        return token
      } catch {
        throw new ServiceUnavailableException('Telegram Token 未配置')
      }
    }
    if (reference.startsWith('env://')) {
      const token = process.env[reference.slice('env://'.length)]
      if (!token) throw new ServiceUnavailableException('Telegram Token 未配置')
      return token
    }
    throw new ServiceUnavailableException('Telegram Token 引用不可用')
  }

  private requestErrorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) return 'Telegram API 请求失败'
    if (error.response?.status === 401) return 'Telegram Token 无效或已失效'
    if (error.response?.status === 409) return 'Telegram 长轮询被其他实例占用'
    const description = this.telegramErrorDescription(error)
    if (error.response?.status === 400 || error.response?.status === 403) {
      return `Telegram API 请求被拒绝 (${error.response.status})${description ? `: ${description}` : ''}`
    }
    if (error.response?.status === 429) {
      return `Telegram API 请求受限 (429)${description ? `: ${description}` : ''}`
    }
    if (error.response?.status && error.response.status >= 500) {
      return `Telegram 服务暂时不可用 (${error.response.status})${description ? `: ${description}` : ''}`
    }
    if (
      error.code === 'ECONNABORTED' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.code === 'ETIMEDOUT'
    ) {
      return 'Telegram 网络连接失败'
    }
    return 'Telegram API 请求失败'
  }

  private sendMessageErrorMessage(error: unknown): string {
    if (!axios.isAxiosError(error)) return 'Telegram 消息发送失败'
    return this.requestErrorMessage(error)
  }

  private isTransientSendError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false
    const status = error.response?.status
    if (status === 429 || (status !== undefined && status >= 500)) return true
    return [
      'ECONNABORTED',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ERR_NETWORK',
      'ECONNRESET',
      'EAI_AGAIN',
    ].includes(error.code ?? '')
  }

  private sendRetryDelay(attempt: number, error: unknown): number {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      const retryAfter = error.response.data?.parameters?.retry_after
      if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
        return Math.min(Math.max(retryAfter, 1) * 1_000, 10_000)
      }
    }
    return SEND_MESSAGE_RETRY_DELAYS_MS[attempt - 1] ?? SEND_MESSAGE_RETRY_DELAYS_MS.at(-1)!
  }

  private sleep(delayMs: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, delayMs))
  }

  private telegramErrorDescription(error: unknown): string | undefined {
    if (!axios.isAxiosError(error)) return undefined
    const description = error.response?.data?.description
    return typeof description === 'string' ? description : undefined
  }
}
