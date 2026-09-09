import type { ResolvedAiRoute } from '../ai.types'
import { AiAdapterCode, AiCapability } from '../ai.types'
import { GeminiGenerateContentAdapter } from './gemini-generate-content.adapter'

describe('GeminiGenerateContentAdapter', () => {
  const route: ResolvedAiRoute = {
    channel: {
      adapterCode: AiAdapterCode.GEMINI_GENERATE_CONTENT,
      apiKey: 'secret',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      code: 'google-primary',
      maxConcurrency: 1,
      maxQueuedRequests: 20,
      timeoutMs: 60_000,
    },
    model: {
      adapterCode: AiAdapterCode.GEMINI_GENERATE_CONTENT,
      code: 'gemini-vision',
      name: 'Gemini vision',
      upstreamModel: 'gemini-2.5-flash',
    },
  }

  it('maps multimodal messages to generateContent and parses text', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({
        candidates: [{ content: { parts: [{ text: 'recognized' }] } }],
        usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2, totalTokenCount: 10 },
      }),
    }
    const adapter = new GeminiGenerateContentAdapter(transport)

    await expect(
      adapter.execute(
        {
          capability: AiCapability.VISION_UNDERSTANDING,
          featureCode: 'image.recognition',
          messages: [
            { role: 'system', content: [{ type: 'text', text: 'Return JSON' }] },
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Read it' },
                { type: 'image_url', url: 'data:image/png;base64,AAAA' },
              ],
            },
          ],
        },
        route,
      ),
    ).resolves.toEqual({
      type: 'text',
      text: 'recognized',
      usage: { inputTokens: 8, outputTokens: 2, totalTokens: 10 },
    })
    expect(transport.post).toHaveBeenCalledWith({
      body: {
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Read it' }, { inlineData: { data: 'AAAA', mimeType: 'image/png' } }],
          },
        ],
        systemInstruction: { parts: [{ text: 'Return JSON' }] },
      },
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'secret' },
      timeoutMs: 60_000,
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    })
  })

  it('parses generated images from generateContent', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({
        candidates: [
          { content: { parts: [{ inlineData: { data: 'AAAA', mimeType: 'image/png' } }] } },
        ],
      }),
    }
    const adapter = new GeminiGenerateContentAdapter(transport)

    await expect(
      adapter.execute(
        {
          capability: AiCapability.IMAGE_GENERATION,
          featureCode: 'image.generate',
          prompt: 'Create an icon',
          sourceImages: [
            { kind: 'url', url: 'https://cdn.example.com/source.png', mimeType: 'image/png' },
            { kind: 'inline', data: Buffer.from('reference'), mimeType: 'image/png' },
          ],
          options: { aspectRatio: '1:1', quality: '1K' },
        },
        route,
      ),
    ).resolves.toEqual({ type: 'images', images: [{ base64: 'AAAA', mimeType: 'image/png' }] })
    expect(transport.post).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          contents: [
            {
              role: 'user',
              parts: [
                { text: 'Create an icon' },
                {
                  fileData: {
                    fileUri: 'https://cdn.example.com/source.png',
                    mimeType: 'image/png',
                  },
                },
                {
                  inlineData: {
                    data: Buffer.from('reference').toString('base64'),
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          ],
        }),
      }),
    )
  })
})
