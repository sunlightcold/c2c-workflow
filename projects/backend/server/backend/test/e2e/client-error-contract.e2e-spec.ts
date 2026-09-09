import type { INestApplication } from '@nestjs/common'
import { Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

const clientErrorDatabaseMock = {
  ClientErrorLevel: { ERROR: 'error', FATAL: 'fatal', WARNING: 'warning' },
  ClientErrorPlatform: {
    ANDROID: 'android',
    DESKTOP: 'desktop',
    IOS: 'ios',
    PWA: 'pwa',
    WEB: 'web',
  },
  ClientErrorSource: {
    CAUGHT: 'caught',
    GLOBAL: 'global',
    NETWORK: 'network',
    PROMISE: 'promise',
    REACT: 'react',
    RESOURCE: 'resource',
    WORKER: 'worker',
  },
  SysClientErrorEventEntity: class SysClientErrorEventEntity {},
}

jest.mock('@/apps/admin/database', () => clientErrorDatabaseMock)

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  Public: () => () => undefined,
  definePermission: (prefix: string, actions: readonly string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

jest.mock('@/apps/admin/interceptors/skip-log.decorator', () => ({
  SkipLog: () => () => undefined,
}))

import { configureAdminHttpApp } from '@/apps/admin/configure-app'
import {
  ClientErrorAdminController,
  ClientErrorIngestController,
} from '@/apps/admin/modules/client-error/client-error.controller'
import { ClientErrorService } from '@/apps/admin/modules/client-error/client-error.service'

describe('Client error API contract (e2e)', () => {
  let app: INestApplication
  const service = {
    create: jest.fn(),
    filter: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
  }

  beforeAll(async () => {
    @Module({
      controllers: [ClientErrorIngestController, ClientErrorAdminController],
      providers: [{ provide: ClientErrorService, useValue: service }],
    })
    class ClientErrorContractModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [ClientErrorContractModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureAdminHttpApp(app)
    await app.init()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    service.create.mockImplementation(async (dto) => ({ eventId: dto.eventId }))
    service.filter.mockResolvedValue({ items: [], meta: {} })
  })

  afterAll(async () => {
    await app.close()
  })

  it('accepts an anonymous client error and preserves its event id', async () => {
    const payload = {
      eventId: '00000000-0000-4000-8000-000000000201',
      appCode: 'magic-perler',
      environment: 'production',
      errorType: 'TypeError',
      level: 'error',
      message: 'Cannot read properties of undefined',
      occurredAt: '2026-08-04T01:00:00.000Z',
      platform: 'web',
      release: '3a8e870c',
      route: '/zh/editor',
      sessionId: '00000000-0000-4000-8000-000000000202',
      source: 'react',
      stack: 'TypeError: Cannot read properties of undefined\n at EditorPageClient',
    }

    const response = await request(app.getHttpServer())
      .post('/v1/client-errors')
      .set('user-agent', 'MagicPerler contract test')
      .send(payload)
      .expect(201)

    expect(response.body.data).toEqual({ eventId: payload.eventId })
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining(payload),
      expect.objectContaining({ userAgent: 'MagicPerler contract test' }),
    )
  })

  it('rejects invalid client error payloads before persistence', async () => {
    await request(app.getHttpServer())
      .post('/v1/client-errors')
      .send({
        eventId: 'not-a-uuid',
        appCode: 'magic-perler',
        environment: 'production',
        level: 'debug',
        message: '',
        occurredAt: 'not-a-date',
        platform: 'web',
        release: '3a8e870c',
        source: 'react',
      })
      .expect(400)

    expect(service.create).not.toHaveBeenCalled()
  })

  it('exposes paginated client errors to administrators', async () => {
    await request(app.getHttpServer())
      .get('/v1/sys/client-errors')
      .query({ pageIndex: 1, pageSize: 20, appCode: 'magic-perler' })
      .expect(200)

    expect(service.filter).toHaveBeenCalledWith(
      expect.objectContaining({ appCode: 'magic-perler', pageIndex: 1, pageSize: 20 }),
    )
  })

  it('rejects oversized administrator pages', async () => {
    await request(app.getHttpServer())
      .get('/v1/sys/client-errors')
      .query({ pageIndex: 1, pageSize: 101 })
      .expect(400)

    expect(service.filter).not.toHaveBeenCalled()
  })
})
