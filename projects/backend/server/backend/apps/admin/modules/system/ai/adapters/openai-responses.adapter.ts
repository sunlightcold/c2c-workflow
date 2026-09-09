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
export class OpenAiResponsesAdapter extends OpenAiAdapterBase implements AiProtocolAdapter {
  async execute(request: AiGatewayRequest, route: ResolvedAiRoute): Promise<AiResult> {
    if (!('messages' in request)) {
      throw new BadGatewayException(`Responses does not support ${request.capability}`)
    }
    return this.executeCompletion(request, route)
  }

  private async executeCompletion(
    request: AiCompletionRequest,
    route: ResolvedAiRoute,
  ): Promise<AiResult> {
    const response = await this.transport.post(
      this.buildCall(route, 'responses', {
        model: route.model.upstreamModel,
        input: request.messages.map((message) => ({
          role: message.role,
          content: message.content.map((part) =>
            part.type === 'text'
              ? { type: 'input_text', text: part.text }
              : { type: 'input_image', image_url: part.url },
          ),
        })),
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      }),
    )
    const record = this.asRecord(response)
    const text = this.readString(record.output_text) ?? this.readOutputText(record.output)
    if (!text) throw new BadGatewayException('Responses response contains no output text')
    const usage = this.readUsage(record.usage)
    return { type: 'text', text: text.trim(), ...(usage ? { usage } : {}) }
  }

  private readOutputText(value: unknown): string | undefined {
    if (!Array.isArray(value)) return undefined
    const text = value
      .flatMap((item) => {
        const content = this.asRecord(item).content
        return Array.isArray(content) ? content : []
      })
      .filter((part) => this.asRecord(part).type === 'output_text')
      .map((part) => this.readString(this.asRecord(part).text) ?? '')
      .join('')
      .trim()
    return text || undefined
  }
}
