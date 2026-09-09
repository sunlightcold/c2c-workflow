import type { ResolvedAiRoute } from '../ai.types'
import { AiAdapterCode, AiCapability } from '../ai.types'
import { OpenAiResponsesAdapter } from './openai-responses.adapter'

describe('OpenAiResponsesAdapter', () => {
  it('maps multimodal messages to responses input and parses output text', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({
        output: [{ content: [{ type: 'output_text', text: '{"items":[]}' }] }],
        usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
      }),
    }
    const adapter = new OpenAiResponsesAdapter(transport)
    const route: ResolvedAiRoute = {
      channel: {
        adapterCode: AiAdapterCode.OPENAI_RESPONSES,
        apiKey: 'secret',
        baseUrl: 'https://gateway.example.com/v1',
        code: 'responses-primary',
        maxConcurrency: 1,
        maxQueuedRequests: 20,
        timeoutMs: 60_000,
      },
      model: {
        adapterCode: AiAdapterCode.OPENAI_RESPONSES,
        code: 'vision-responses',
        name: 'Vision responses',
        upstreamModel: 'upstream-responses-model',
      },
    }

    await expect(
      adapter.execute(
        {
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
        },
        route,
      ),
    ).resolves.toEqual({
      type: 'text',
      text: '{"items":[]}',
      usage: { inputTokens: 10, outputTokens: 3, totalTokens: 13 },
    })
    expect(transport.post).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          input: [
            {
              role: 'user',
              content: [
                { type: 'input_text', text: 'Read codes' },
                { type: 'input_image', image_url: 'data:image/png;base64,AAAA' },
              ],
            },
          ],
          model: 'upstream-responses-model',
        },
        url: 'https://gateway.example.com/v1/responses',
      }),
    )
  })
})
