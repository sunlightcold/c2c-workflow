import type { ResolvedAiRoute } from '../ai.types'
import { AiAdapterCode, AiCapability } from '../ai.types'
import { OpenAiImagesAdapter } from './openai-images.adapter'

describe('OpenAiImagesAdapter', () => {
  const route: ResolvedAiRoute = {
    channel: {
      adapterCode: AiAdapterCode.OPENAI_IMAGES,
      apiKey: 'secret',
      baseUrl: 'https://gateway.example.com/v1',
      code: 'images-primary',
      maxConcurrency: 1,
      maxQueuedRequests: 20,
      timeoutMs: 600_000,
    },
    model: {
      adapterCode: AiAdapterCode.OPENAI_IMAGES,
      code: 'image-main',
      name: 'Image main',
      upstreamModel: 'upstream-image',
    },
  }

  it('executes image generation and normalizes image results', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({
        data: [{ url: 'https://cdn.example.com/result.png' }],
        usage: { input_tokens: 8, output_tokens: 20, total_tokens: 28 },
      }),
    }
    const adapter = new OpenAiImagesAdapter(transport)
    await expect(
      adapter.execute(
        {
          capability: AiCapability.IMAGE_GENERATION,
          featureCode: 'pixel-art.image-to-pixel',
          prompt: 'Create pixel art',
          options: { outputFormat: 'png', quality: 'high', size: '1024x1024' },
        },
        route,
      ),
    ).resolves.toEqual({
      type: 'images',
      images: [{ mimeType: 'image/png', url: 'https://cdn.example.com/result.png' }],
      usage: { inputTokens: 8, outputTokens: 20, totalTokens: 28 },
    })
  })

  it('uses image edits when source images are present', async () => {
    const transport = {
      post: jest.fn().mockResolvedValue({ data: [{ b64_json: 'AAAA' }] }),
    }
    const adapter = new OpenAiImagesAdapter(transport)

    await adapter.execute(
      {
        capability: AiCapability.IMAGE_GENERATION,
        featureCode: 'pixel-art.image-to-pixel',
        prompt: 'Convert to pixel art',
        sourceImages: [
          { kind: 'url', url: 'https://cdn.example.com/source.png', mimeType: 'image/png' },
          { kind: 'inline', data: Buffer.from('reference'), mimeType: 'image/png' },
        ],
      },
      route,
    )

    expect(transport.post).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          images: [
            { image_url: 'https://cdn.example.com/source.png' },
            {
              image_url: `data:image/png;base64,${Buffer.from('reference').toString('base64')}`,
            },
          ],
        }),
        url: 'https://gateway.example.com/v1/images/edits',
      }),
    )
  })
})
