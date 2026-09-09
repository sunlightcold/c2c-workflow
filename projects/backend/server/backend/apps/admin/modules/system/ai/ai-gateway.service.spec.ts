import type { AiGatewayRequest, AiTextResult } from './ai.types'
import { AiAdapterCode, AiCapability } from './ai.types'
import { AiGatewayService } from './ai-gateway.service'
import { AiUpstreamRequestError } from './ai-transport'
import { Logger } from '@nestjs/common'
import { AiCallLogStatus } from './ai.types'

describe('AiGatewayService', () => {
  let logger: jest.SpyInstance

  beforeEach(() => {
    logger = jest.spyOn(Logger.prototype, 'warn').mockImplementation()
  })

  afterEach(() => jest.restoreAllMocks())

  it('executes a feature through its configured model, channel and protocol adapter', async () => {
    const route = {
      channel: {
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        apiKey: 'secret',
        baseUrl: 'https://provider.example.com/v1',
        code: 'primary',
        maxConcurrency: 1,
        maxQueuedRequests: 20,
        timeoutMs: 60_000,
      },
      model: {
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        code: 'vision-small',
        name: 'Vision small',
        upstreamModel: 'provider-vision-small',
      },
    }
    const routeResolver = {
      resolve: jest.fn().mockResolvedValue([route]),
    }
    const expected: AiTextResult = { type: 'text', text: '{"items":[]}' }
    const adapter = {
      execute: jest.fn().mockResolvedValue(expected),
    }
    const adapterRegistry = {
      get: jest.fn().mockReturnValue(adapter),
    }
    const gateway = new AiGatewayService(routeResolver, adapterRegistry)
    const request: AiGatewayRequest = {
      capability: AiCapability.VISION_UNDERSTANDING,
      featureCode: 'perler.color-recognition',
      routeTarget: {
        channelCode: 'primary',
        modelCode: 'vision-small',
      },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Read the color codes' },
            { type: 'image_url', url: 'data:image/png;base64,AAAA' },
          ],
        },
      ],
    }

    await expect(gateway.execute(request)).resolves.toEqual(expected)
    expect(routeResolver.resolve).toHaveBeenCalledWith(
      'perler.color-recognition',
      AiCapability.VISION_UNDERSTANDING,
      {
        channelCode: 'primary',
        modelCode: 'vision-small',
      },
    )
    expect(adapterRegistry.get).toHaveBeenCalledWith(AiAdapterCode.OPENAI_CHAT_COMPLETIONS)
    expect(adapter.execute).toHaveBeenCalledWith(request, route)
  })

  it('records one successful provider call with route and usage metadata', async () => {
    const route = createRoute('primary')
    const adapter = {
      execute: jest.fn().mockResolvedValue({ type: 'text', text: 'ok', usage: { totalTokens: 7 } }),
    }
    const callLogService = { record: jest.fn().mockResolvedValue(undefined) }
    const gateway = new AiGatewayService(
      { resolve: jest.fn().mockResolvedValue([route]) },
      { get: jest.fn().mockReturnValue(adapter) },
      callLogService,
    )

    await gateway.execute({ ...createRequest(), context: { requestId: 'req-1', userId: 'user-1' } })

    expect(callLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterCode: route.model.adapterCode,
        attempt: 1,
        capability: AiCapability.TEXT_COMPLETION,
        channelCode: route.channel.code,
        featureCode: 'content.summary',
        modelCode: route.model.code,
        requestId: 'req-1',
        status: AiCallLogStatus.SUCCESS,
        totalTokens: 7,
        userId: 'user-1',
      }),
    )
  })

  it('fails over only when the upstream failure is retryable', async () => {
    const routes = [createRoute('primary'), createRoute('secondary')]
    const first = {
      execute: jest.fn().mockRejectedValue(new AiUpstreamRequestError('rate', true, 429)),
    }
    const second = { execute: jest.fn().mockResolvedValue({ type: 'text', text: 'ok' }) }
    const gateway = new AiGatewayService(
      { resolve: jest.fn().mockResolvedValue(routes) },
      { get: jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) },
    )

    await expect(gateway.execute(createRequest())).resolves.toEqual({ type: 'text', text: 'ok' })
    expect(first.execute).toHaveBeenCalledTimes(1)
    expect(second.execute).toHaveBeenCalledTimes(1)
  })

  it('does not fail over on a non-retryable upstream failure', async () => {
    const first = {
      execute: jest.fn().mockRejectedValue(new AiUpstreamRequestError('bad', false, 400)),
    }
    const second = { execute: jest.fn() }
    const gateway = new AiGatewayService(
      { resolve: jest.fn().mockResolvedValue([createRoute('primary'), createRoute('secondary')]) },
      { get: jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) },
    )

    await expect(gateway.execute(createRequest())).rejects.toMatchObject({ status: 400 })
    expect(second.execute).not.toHaveBeenCalled()
  })

  it('logs each failed route without exposing the upstream reason through the final error', async () => {
    const routes = [createRoute('primary'), createRoute('secondary')]
    const first = {
      execute: jest.fn().mockRejectedValue(new AiUpstreamRequestError('upstream timeout', true)),
    }
    const second = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new AiUpstreamRequestError(
            'AI upstream request failed with status 503: model overloaded',
            true,
            503,
          ),
        ),
    }
    const gateway = new AiGatewayService(
      { resolve: jest.fn().mockResolvedValue(routes) },
      { get: jest.fn().mockReturnValueOnce(first).mockReturnValueOnce(second) },
    )

    await expect(gateway.execute(createRequest())).rejects.toThrow(
      'All AI routes failed for feature: content.summary',
    )
    expect(logger).toHaveBeenCalledTimes(2)
    expect(logger).toHaveBeenLastCalledWith(
      expect.stringContaining(
        '"channelCode":"secondary","modelCode":"text-small","adapterCode":"openai-chat-completions","status":503,"retryable":true,"reason":"AI upstream request failed with status 503: model overloaded"',
      ),
    )
  })

  it('lists safe route targets and selects the requested model', async () => {
    const routes = [createRoute('primary'), createRoute('secondary')]
    routes[0].channel.maxConcurrency = 2
    routes[0].channel.maxQueuedRequests = 15
    routes[0].model.name = 'Primary image model'
    routes[1].model.code = 'image-secondary'
    routes[1].model.name = 'Secondary image model'
    const gateway = new AiGatewayService(
      { resolve: jest.fn().mockResolvedValue(routes) },
      { get: jest.fn() },
    )

    await expect(
      gateway.listTargets('pixel-art.image-generation', AiCapability.IMAGE_GENERATION),
    ).resolves.toEqual([
      {
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        channelCode: 'primary',
        maxConcurrency: 2,
        maxQueuedRequests: 15,
        modelCode: 'text-small',
        modelName: 'Primary image model',
      },
      expect.objectContaining({ modelCode: 'image-secondary' }),
    ])
    await expect(
      gateway.resolveTarget(
        'pixel-art.image-generation',
        AiCapability.IMAGE_GENERATION,
        'image-secondary',
      ),
    ).resolves.toEqual(expect.objectContaining({ channelCode: 'secondary' }))
  })

  it('resolves the exact execution route for a trusted server adapter', async () => {
    const route = createRoute('primary')
    const routeResolver = { resolve: jest.fn().mockResolvedValue([route]) }
    const gateway = new AiGatewayService(routeResolver, { get: jest.fn() })

    await expect(
      gateway.resolveExecutionRoute('pixel-art.image-to-pixel', AiCapability.IMAGE_GENERATION, {
        channelCode: 'primary',
        modelCode: 'text-small',
      }),
    ).resolves.toBe(route)
    expect(routeResolver.resolve).toHaveBeenCalledWith(
      'pixel-art.image-to-pixel',
      AiCapability.IMAGE_GENERATION,
      { channelCode: 'primary', modelCode: 'text-small' },
    )
  })
})

function createRoute(code: string) {
  return {
    channel: {
      adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
      apiKey: 'secret',
      baseUrl: 'https://provider.example.com/v1',
      code,
      maxConcurrency: 1,
      maxQueuedRequests: 20,
      timeoutMs: 60_000,
    },
    model: {
      adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
      code: 'text-small',
      name: 'Text small',
      upstreamModel: 'upstream-text-small',
    },
  }
}

function createRequest(): AiGatewayRequest {
  return {
    capability: AiCapability.TEXT_COMPLETION,
    featureCode: 'content.summary',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Summarize' }] }],
  }
}
