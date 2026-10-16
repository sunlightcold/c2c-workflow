/// <reference types="jest" />
jest.mock('@/apps/admin/modules/system/auth/auth.service', () => ({
  AuthService: class AuthService {},
}))
jest.mock('@admin/modules/cache', () => ({ CacheService: class CacheService {} }))
jest.mock('nanoid', () => ({ nanoid: () => 'test-id', customAlphabet: () => () => 'test-id' }))
import { Test } from '@nestjs/testing'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { ProxyController } from '@/apps/admin/modules/proxy/proxy.controller'
import { ProxyService } from '@/apps/admin/modules/proxy/proxy.service'
import { ProxyProbeService } from '@/apps/admin/modules/proxy/proxy-probe.service'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { configureAdminHttpApp } from '@/apps/admin/configure-app'
import { Reflector } from '@nestjs/core'
import { RbacAuthGuard } from '@/apps/admin/modules/system/auth/guards/rbac.guard'
import { ActorType } from '@/common/interfaces'

describe('proxy HTTP contract', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001'
  const otherTenantId = '00000000-0000-4000-8000-000000000002'
  const service = {
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    all: jest.fn().mockResolvedValue([]),
    accounts: jest.fn().mockResolvedValue([{ id: 'merchant-1', name: 'Merchant' }]),
    exportData: jest.fn().mockResolvedValue({ exported_at: '', proxies: [], accounts: [] }),
    importData: jest.fn().mockResolvedValue({
      proxy_created: 1,
      proxy_reused: 0,
      proxy_failed: 0,
      account_created: 0,
      account_failed: 0,
    }),
    batch: jest.fn().mockResolvedValue({ created: 1, skipped: 0 }),
  }
  const cache = { getPermissions: jest.fn() }
  let app: INestApplication
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [ProxyController],
      providers: [
        BusinessScopeService,
        { provide: ProxyService, useValue: service },
        { provide: ProxyProbeService, useValue: {} },
      ],
    }).compile()
    app = module.createNestApplication()
    app.useGlobalGuards(
      Object.assign(new RbacAuthGuard(), { reflector: new Reflector(), cacheService: cache }),
    )
    app.use((req, _res, next) => {
      req.user = { actorType: ActorType.TENANT, tenantId, uid: 'test-user' }
      next()
    })
    configureAdminHttpApp(app)
    app.setGlobalPrefix('v1/sys')
    await app.init()
  })
  beforeEach(() => {
    cache.getPermissions.mockResolvedValue([
      'system:proxy:read',
      'system:proxy:create',
      'system:proxy:import',
      'system:proxy:export',
    ])
    service.accounts.mockClear()
  })
  afterAll(async () => {
    await app.close()
  })
  it('keeps the original JSON wrapper and fields through DTO validation', async () => {
    const data = {
      exported_at: '2026-10-16T00:00:00Z',
      proxies: [
        {
          proxy_key: 'http|host|80|user|test-value',
          protocol: 'http',
          host: 'host',
          port: 80,
          password: 'test-value',
        },
      ],
      accounts: [],
    }
    const response = await request(app.getHttpServer())
      .post('/v1/sys/proxies/data')
      .send({ data })
      .expect(201)
    expect(response.body).toMatchObject({ code: 200, data: { proxy_created: 1 }, msg: 'success' })
    expect(service.importData).toHaveBeenCalledWith(tenantId, data)
  })
  it('accepts original batch objects without names and routes all/data before ids', async () => {
    await request(app.getHttpServer())
      .post('/v1/sys/proxies/batch')
      .send({
        proxies: [{ protocol: 'socks5h', host: '::1', port: 1080, username: 'u', password: 'p' }],
      })
      .expect(201)
    expect(service.batch).toHaveBeenCalledWith(tenantId, [
      expect.objectContaining({ protocol: 'socks5h', host: '::1', port: 1080 }),
    ])
    await request(app.getHttpServer()).get('/v1/sys/proxies/all').expect(200)
    await request(app.getHttpServer()).get('/v1/sys/proxies/data').expect(200)
    expect(service.exportData).toHaveBeenCalledWith(tenantId, expect.anything())
  })
  it('rejects tenant substitution and invalid bulk ports before service execution', async () => {
    service.importData.mockClear()
    await request(app.getHttpServer())
      .post('/v1/sys/proxies/data')
      .send({ tenantId: otherTenantId, data: { proxies: [], accounts: [] } })
      .expect(403)
    expect(service.importData).not.toHaveBeenCalled()
    await request(app.getHttpServer())
      .post('/v1/sys/proxies/batch')
      .send({ proxies: [{ protocol: 'http', host: 'host', port: 65536 }] })
      .expect(400)
  })
  it.each([
    { permissions: [] },
    { permissions: ['system:proxy:read'] },
    { permissions: ['merchant:account:read'] },
  ])('rejects bound merchant disclosure without both permissions: %j', async ({ permissions }) => {
    cache.getPermissions.mockResolvedValue(permissions)
    await request(app.getHttpServer())
      .get('/v1/sys/proxies/00000000-0000-4000-8000-000000000003/accounts')
      .expect(403)
    expect(service.accounts).not.toHaveBeenCalled()
  })
  it('returns scoped bound merchants with both proxy and merchant read permissions', async () => {
    cache.getPermissions.mockResolvedValue(['system:proxy:read', 'merchant:account:read'])
    const id = '00000000-0000-4000-8000-000000000003'
    await request(app.getHttpServer()).get(`/v1/sys/proxies/${id}/accounts`).expect(200)
    expect(service.accounts).toHaveBeenCalledWith(tenantId, id)
  })
})
