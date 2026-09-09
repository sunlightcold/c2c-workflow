import { AiAdapterCode, AiCapability } from '@/common/models'
import { SysAiChannelStatus } from '@admin/database/system/ai-channel.entity'
import { DatabaseAiRouteResolver } from './ai-route-resolver.service'

describe('DatabaseAiRouteResolver', () => {
  it('returns active compatible routes in configured priority order', async () => {
    const routeRepository = {
      find: jest
        .fn()
        .mockResolvedValue([
          createRoute(1, AiAdapterCode.OPENAI_RESPONSES),
          createRoute(2, AiAdapterCode.OPENAI_CHAT_COMPLETIONS),
        ]),
    }
    const credentialCipher = { decrypt: jest.fn().mockReturnValue('decrypted-key') }
    const resolver = new DatabaseAiRouteResolver(
      routeRepository as never,
      credentialCipher as never,
    )

    await expect(
      resolver.resolve('content.summary', AiCapability.TEXT_COMPLETION),
    ).resolves.toHaveLength(2)
    expect(routeRepository.find).toHaveBeenCalledWith({
      where: {
        featureCode: 'content.summary',
        capability: AiCapability.TEXT_COMPLETION,
        enabled: true,
      },
      relations: { channel: true, model: true },
      order: { priority: 'ASC' },
    })
  })

  it('excludes routes whose model and channel use different protocols', async () => {
    const route = createRoute(1, AiAdapterCode.OPENAI_RESPONSES)
    route.model.adapterCode = AiAdapterCode.OPENAI_CHAT_COMPLETIONS
    const routeRepository = { find: jest.fn().mockResolvedValue([route]) }
    const credentialCipher = { decrypt: jest.fn() }
    const resolver = new DatabaseAiRouteResolver(
      routeRepository as never,
      credentialCipher as never,
    )

    await expect(
      resolver.resolve('content.summary', AiCapability.TEXT_COMPLETION),
    ).resolves.toEqual([])
  })

  it('resolves only the frozen route target for an existing feature route', async () => {
    const routeRepository = {
      find: jest.fn().mockResolvedValue([createRoute(1, AiAdapterCode.OPENAI_RESPONSES)]),
    }
    const credentialCipher = { decrypt: jest.fn().mockReturnValue('decrypted-key') }
    const resolver = new DatabaseAiRouteResolver(
      routeRepository as never,
      credentialCipher as never,
    )

    await expect(
      resolver.resolve('content.summary', AiCapability.TEXT_COMPLETION, {
        channelCode: 'channel-1',
        modelCode: 'model-1',
      }),
    ).resolves.toHaveLength(1)
    expect(routeRepository.find).toHaveBeenCalledWith({
      where: {
        featureCode: 'content.summary',
        capability: AiCapability.TEXT_COMPLETION,
        enabled: true,
        channel: { code: 'channel-1' },
        model: { code: 'model-1' },
      },
      relations: { channel: true, model: true },
      order: { priority: 'ASC' },
    })
  })
})

function createRoute(priority: number, adapterCode: AiAdapterCode) {
  return {
    priority,
    channel: {
      adapterCode,
      baseUrl: 'https://provider.example.com/v1',
      code: `channel-${priority}`,
      encryptedApiKey: 'encrypted',
      maxConcurrency: 3,
      maxQueuedRequests: 25,
      status: SysAiChannelStatus.ACTIVE,
      timeoutMs: 60_000,
    },
    model: {
      adapterCode,
      capabilities: [AiCapability.TEXT_COMPLETION],
      code: `model-${priority}`,
      enabled: true,
      name: `Model ${priority}`,
      upstreamModel: `upstream-${priority}`,
    },
  }
}
