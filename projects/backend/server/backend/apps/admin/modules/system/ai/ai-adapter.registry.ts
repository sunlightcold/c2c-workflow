import { AiAdapterCode } from '@/common/models'
import { Injectable } from '@nestjs/common'
import { OpenAiChatCompletionsAdapter } from './adapters/openai-chat-completions.adapter'
import { OpenAiImagesAdapter } from './adapters/openai-images.adapter'
import { OpenAiResponsesAdapter } from './adapters/openai-responses.adapter'
import { GeminiGenerateContentAdapter } from './adapters/gemini-generate-content.adapter'
import { AiAdapterRegistry, AiProtocolAdapter } from './ai.types'

@Injectable()
export class DefaultAiAdapterRegistry implements AiAdapterRegistry {
  private readonly adapters: ReadonlyMap<AiAdapterCode, AiProtocolAdapter>

  constructor(
    chatCompletions: OpenAiChatCompletionsAdapter,
    responses: OpenAiResponsesAdapter,
    images: OpenAiImagesAdapter,
    geminiGenerateContent: GeminiGenerateContentAdapter,
  ) {
    this.adapters = new Map<AiAdapterCode, AiProtocolAdapter>([
      [AiAdapterCode.OPENAI_CHAT_COMPLETIONS, chatCompletions],
      [AiAdapterCode.OPENAI_RESPONSES, responses],
      [AiAdapterCode.OPENAI_IMAGES, images],
      [AiAdapterCode.GEMINI_GENERATE_CONTENT, geminiGenerateContent],
    ])
  }

  get(adapterCode: AiAdapterCode): AiProtocolAdapter {
    const adapter = this.adapters.get(adapterCode)
    if (!adapter) throw new Error(`Unsupported AI adapter: ${adapterCode}`)
    return adapter
  }
}
