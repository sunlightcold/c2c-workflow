import axios from 'axios'
import { Injectable, ServiceUnavailableException } from '@nestjs/common'

export interface TelegramSendMessageInput {
  chatId: string
  replyMarkup?: Record<string, unknown>
  replyToMessageId?: number
  text: string
  tokenRef: string
}

@Injectable()
export class TelegramApiClient {
  async sendMessage(input: TelegramSendMessageInput): Promise<void> {
    const token = this.resolveToken(input.tokenRef)
    try {
      await axios.post(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          chat_id: input.chatId,
          text: input.text,
          ...(input.replyToMessageId
            ? {
                reply_parameters: {
                  allow_sending_without_reply: true,
                  message_id: input.replyToMessageId,
                },
              }
            : {}),
          ...(input.replyMarkup ? { reply_markup: input.replyMarkup } : {}),
        },
        { timeout: 10_000 },
      )
    } catch {
      throw new ServiceUnavailableException('Telegram 消息发送失败')
    }
  }

  private resolveToken(reference: string): string {
    if (!reference.startsWith('env://'))
      throw new ServiceUnavailableException('Telegram Token 引用不可用')
    const token = process.env[reference.slice('env://'.length)]
    if (!token) throw new ServiceUnavailableException('Telegram Token 未配置')
    return token
  }
}
