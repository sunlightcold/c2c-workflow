import { AiAdapterCode, AiCapability } from '@/common/models'
import { AiFeatureRouteService } from './ai-feature-route.service'

describe('AiFeatureRouteService', () => {
  it('does not expose encrypted channel credentials when listing routes', async () => {
    const routeRepository = {
      find: jest.fn().mockResolvedValue([
        {
          capability: AiCapability.TEXT_COMPLETION,
          channelId: 'channel',
          enabled: true,
          featureCode: 'content.summary',
          id: 'route',
          modelId: 'model',
          priority: 1,
          updatedAt: new Date('2026-01-01T00:00:00Z'),
          channel: {
            adapterCode: AiAdapterCode.OPENAI_RESPONSES,
            code: 'primary',
            encryptedApiKey: 'must-not-leak',
            id: 'channel',
            name: 'Primary',
            status: 'active',
            supplier: 'openai',
          },
          model: {
            adapterCode: AiAdapterCode.OPENAI_RESPONSES,
            code: 'summary',
            enabled: true,
            id: 'model',
            name: 'Summary',
            upstreamModel: 'gpt-5',
          },
        },
      ]),
    }
    const emptyRepository = {}
    const service = new AiFeatureRouteService(
      routeRepository as never,
      emptyRepository as never,
      emptyRepository as never,
    )

    const routes = await service.list()
    expect(routes[0].channel).not.toHaveProperty('encryptedApiKey')
  })

  it('rejects a route whose channel and model use different protocols', async () => {
    const routeRepository = { exists: jest.fn(), create: jest.fn(), save: jest.fn() }
    const channelRepository = {
      findOne: jest.fn().mockResolvedValue({ adapterCode: AiAdapterCode.OPENAI_RESPONSES }),
    }
    const modelRepository = {
      findOne: jest.fn().mockResolvedValue({
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        capabilities: [AiCapability.TEXT_COMPLETION],
      }),
    }
    const service = new AiFeatureRouteService(
      routeRepository as never,
      channelRepository as never,
      modelRepository as never,
    )

    await expect(
      service.create({
        capability: AiCapability.TEXT_COMPLETION,
        channelId: 'channel',
        enabled: true,
        featureCode: 'content.summary',
        modelId: 'model',
        priority: 1,
      }),
    ).rejects.toThrow('same protocol adapter')
    expect(routeRepository.save).not.toHaveBeenCalled()
  })

  it('atomically swaps an occupied route priority', async () => {
    const current = {
      enabled: true,
      featureCode: 'content.summary',
      id: 'route-1',
      priority: 1,
    }
    const displaced = {
      enabled: true,
      featureCode: 'content.summary',
      id: 'route-2',
      priority: 2,
    }
    const saves: Array<{ id: string; priority: number }> = []
    const transactionRepository = {
      find: jest.fn().mockResolvedValue([current, displaced]),
      save: jest.fn().mockImplementation(async (route) => {
        saves.push({ id: route.id, priority: route.priority })
        return { ...route }
      }),
    }
    const routeRepository = {
      findOne: jest.fn().mockResolvedValue(current),
      manager: {
        transaction: jest
          .fn()
          .mockImplementation(async (work) => work({ getRepository: () => transactionRepository })),
      },
      save: jest.fn(),
    }
    const emptyRepository = {}
    const service = new AiFeatureRouteService(
      routeRepository as never,
      emptyRepository as never,
      emptyRepository as never,
    )

    await expect(service.update('route-1', { priority: 2 })).resolves.toMatchObject({
      id: 'route-1',
      priority: 2,
    })
    expect(saves).toEqual([
      { id: 'route-2', priority: 3 },
      { id: 'route-1', priority: 2 },
      { id: 'route-2', priority: 1 },
    ])
  })
})
