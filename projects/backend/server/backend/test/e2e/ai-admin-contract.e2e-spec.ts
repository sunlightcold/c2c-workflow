import request from 'supertest'
import type { INestApplication } from '@nestjs/common'

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  definePermission: (prefix: string, actions: string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

import { AiAdapterCode, AiCapability } from '@/common/models'
import { AiChannelService } from '@/apps/admin/modules/system/ai/ai-channel.service'
import { AiController } from '@/apps/admin/modules/system/ai/ai.controller'
import { AiFeatureRouteService } from '@/apps/admin/modules/system/ai/ai-feature-route.service'
import { AiModelService } from '@/apps/admin/modules/system/ai/ai-model.service'
import {
  createAdminContractTestApp,
  expectWrappedError,
  expectWrappedSuccess,
} from './helpers/admin-contract-test-app'

describe('AI administration API contract (e2e)', () => {
  let app: INestApplication
  const channelService = {
    create: jest.fn(),
    list: jest.fn(),
    test: jest.fn(),
  }
  const modelService = { create: jest.fn(), list: jest.fn() }
  const routeService = { create: jest.fn(), list: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [AiController],
      path: 'sys',
      providers: [
        { provide: AiChannelService, useValue: channelService },
        { provide: AiModelService, useValue: modelService },
        { provide: AiFeatureRouteService, useValue: routeService },
      ],
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    channelService.list.mockResolvedValue([
      {
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        code: 'ephone-primary',
        hasApiKey: true,
        supplier: 'ephone',
      },
    ])
    modelService.list.mockResolvedValue([])
    routeService.list.mockResolvedValue([])
  })

  afterAll(async () => {
    await app.close()
  })

  it('exposes channels, models and feature routes under the system AI route', async () => {
    const channels = await request(app.getHttpServer()).get('/v1/sys/ai/channels').expect(200)
    expectWrappedSuccess(channels.body)
    expect(channels.body.data[0]).toEqual(
      expect.objectContaining({
        adapterCode: AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
        supplier: 'ephone',
      }),
    )

    await request(app.getHttpServer()).get('/v1/sys/ai/models').expect(200)
    await request(app.getHttpServer()).get('/v1/sys/ai/feature-routes').expect(200)
  })

  it.each([
    AiAdapterCode.OPENAI_CHAT_COMPLETIONS,
    AiAdapterCode.OPENAI_RESPONSES,
  ])('accepts the explicit %s protocol when creating a channel', async (adapterCode) => {
    channelService.create.mockResolvedValue({ code: 'openai-primary', adapterCode })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/ai/channels')
      .send({
        adapterCode,
        apiKey: 'secret',
        baseUrl: 'https://provider.example.com/v1',
        code: 'openai-primary',
        name: 'OpenAI Primary',
        supplier: 'openai',
      })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(channelService.create).toHaveBeenCalledWith(
      expect.objectContaining({ adapterCode, supplier: 'openai' }),
    )
  })

  it('rejects the removed ambiguous openai protocol', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/ai/channels')
      .send({
        adapterCode: 'openai',
        apiKey: 'secret',
        baseUrl: 'https://provider.example.com/v1',
        code: 'openai-primary',
        name: 'OpenAI Primary',
        supplier: 'openai',
      })
      .expect(400)

    expectWrappedError(response.body, 400)
    expect(channelService.create).not.toHaveBeenCalled()
  })

  it('passes model and capability into the channel connection test', async () => {
    const channelId = '00000000-0000-4000-8000-000000000001'
    const modelId = '00000000-0000-4000-8000-000000000002'
    channelService.test.mockResolvedValue({ status: 'disabled', lastCheckMessage: 'Connection test passed' })

    await request(app.getHttpServer())
      .post(`/v1/sys/ai/channels/${channelId}/test`)
      .send({ modelId, capability: AiCapability.TEXT_COMPLETION })
      .expect(201)

    expect(channelService.test).toHaveBeenCalledWith(
      channelId,
      modelId,
      AiCapability.TEXT_COMPLETION,
    )
  })
})
