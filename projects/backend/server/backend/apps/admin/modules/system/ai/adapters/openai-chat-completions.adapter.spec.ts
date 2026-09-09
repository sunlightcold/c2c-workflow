import type { AiGatewayRequest, ResolvedAiRoute } from '../ai.types'
import { AiAdapterCode, AiCapability } from '../ai.types'
import { OpenAiChatCompletionsAdapter } from './openai-chat-completions.adapter'

describe('OpenAiChatCompletionsAdapter', () => {
  it('maps multimodal messages to chat completions and parses text', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({
        choices: [{ message: { content: '{"items":[]}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
      }),
    }
    const adapter = new OpenAiChatCompletionsAdapter(transport)
    const request: AiGatewayRequest = {
      capability: AiCapability.VISION_UNDERSTANDING,
      featureCode: 'perler.color-recognition',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read codes' },
            { type: 'image_url', url: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
      temperature: 0,
    }
    const route = createRoute(AiAdapterCode.OPENAI_CHAT_COMPLETIONS)

    await expect(adapter.execute(request, route)).resolves.toEqual({
      type: 'text',
      text: '{"items":[]}',
      usage: { inputTokens: 12, outputTokens: 4, totalTokens: 16 },
    })
    expect(transport.post).toHaveBeenCalledWith({
      body: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Read codes' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            ],
          },
        ],
        model: 'upstream-model',
        stream: false,
        temperature: 0,
      },
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      timeoutMs: 60_000,
      url: 'https://gateway.example.com/v1/chat/completions',
    })
  })
})

function createRoute(adapterCode: AiAdapterCode): ResolvedAiRoute {
  return {
    channel: {
      adapterCode,
      apiKey: 'secret',
      baseUrl: 'https://gateway.example.com/v1',
      code: 'primary',
      maxConcurrency: 1,
      maxQueuedRequests: 20,
      timeoutMs: 60_000,
    },
    model: { adapterCode, code: 'model', name: 'Model', upstreamModel: 'upstream-model' },
  }
}
