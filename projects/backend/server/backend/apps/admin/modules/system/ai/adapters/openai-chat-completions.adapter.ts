import { BadGatewayException, Injectable } from '@nestjs/common'
import {
  AiCompletionRequest,
  AiGatewayRequest,
  AiProtocolAdapter,
  AiResult,
  ResolvedAiRoute,
} from '../ai.types'
import { OpenAiAdapterBase } from './openai-adapter-base'

@Injectable()
export class OpenAiChatCompletionsAdapter extends OpenAiAdapterBase implements AiProtocolAdapter {
  async execute(request: AiGatewayRequest, route: ResolvedAiRoute): Promise<AiResult> {
    if (!('messages' in request)) {
      throw new BadGatewayException(`Chat Completions does not support ${request.capability}`)
    }
    return this.executeCompletion(request, route)
  }

  private async executeCompletion(
    request: AiCompletionRequest,
    route: ResolvedAiRoute,
  ): Promise<AiResult> {
    const response = await this.transport.post(
      this.buildCall(route, 'chat/completions', {
        model: route.model.upstreamModel,
        messages: request.messages.map((message) => ({
          role: message.role,
          content: message.content.map((part) =>
            part.type === 'text' ? part : { type: 'image_url', image_url: { url: part.url } },
          ),
        })),
        stream: false,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      }),
    )
    const record = this.asRecord(response)
    const choices = Array.isArray(record.choices) ? record.choices : []
    const content = this.asRecord(this.asRecord(choices[0]).message).content
    const text = this.readChatText(content)
    if (!text) throw new BadGatewayException('Chat Completions response contains no text')
    const usage = this.readUsage(record.usage)
    return { type: 'text', text, ...(usage ? { usage } : {}) }
  }

  private readChatText(content: unknown): string | undefined {
    if (typeof content === 'string' && content.trim()) return content.trim()
    if (!Array.isArray(content)) return undefined
    const text = content
      .map((part) => this.readString(this.asRecord(part).text) ?? '')
      .join('')
      .trim()
    return text || undefined
  }
}
