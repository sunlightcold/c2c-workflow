import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { C2cAdController } from '@/apps/admin/modules/c2c-ad/ad.controller'
import { AdPricingRunner } from '@/apps/admin/modules/c2c-ad/ad-pricing-runner.service'
import { C2cAdService } from '@/apps/admin/modules/c2c-ad/ad.service'
import { DEFAULT_ADMIN_MENUS } from '@/apps/admin/modules/system/menu/registry/default-admin-menus'
import {
  createAdminContractTestApp,
  expectWrappedError,
  expectWrappedSuccess,
} from './helpers/admin-contract-test-app'

jest.mock('@/common/decorators', () => {
  const { createParamDecorator, SetMetadata } = jest.requireActual('@nestjs/common')
  return {
    Permission: (permission: string | string[] | { anyOf: string[] }) =>
      SetMetadata('contract:permission', permission),
    User: createParamDecorator((key: string | undefined) => {
      const actor = {
        actorType: 'TENANT',
        tenantId: '00000000-0000-4000-8000-000000000010',
        uid: 7,
        username: 'contract-operator',
      }
      return key ? actor[key as keyof typeof actor] : actor
    }),
    definePermission: (prefix: string, actions: readonly string[]) =>
      Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
  }
})

const tenantId = '00000000-0000-4000-8000-000000000010'
const otherTenantId = '00000000-0000-4000-8000-000000000011'
const merchantId = '00000000-0000-4000-8000-000000000020'
const adId = '00000000-0000-4000-8000-000000000030'
const runId = '00000000-0000-4000-8000-000000000040'

function fixedRule() {
  return {
    excludeInactive: false,
    linkedAdId: null,
    linkedDiscount: null,
    mode: 'FIXED',
    step: '0.01',
    competitorAmount: '1000.00',
    competitorPaymentMethods: ['ALIPAY'],
    competitorPeriod: null,
    merchantOnly: true,
    followNickname: null,
    blockedNicknames: [],
    fixedLimit: '7.10',
    profitPerUsdt: null,
    feePercent: null,
    referencePaymentMethods: [],
    referencePosition: 3,
    intervalSeconds: 15,
  }
}

describe('Merchant advertisement API contract (e2e)', () => {
  let app: INestApplication
  const ads = {
    merchantOptions: jest.fn(),
    list: jest.fn(),
    detail: jest.fn(),
    sync: jest.fn(),
    saveRule: jest.fn(),
    automation: jest.fn(),
    listRuns: jest.fn(),
    runDetail: jest.fn(),
  }
  const runner = { run: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [C2cAdController],
      path: 'sys',
      providers: [
        BusinessScopeService,
        { provide: C2cAdService, useValue: ads },
        { provide: AdPricingRunner, useValue: runner },
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('registers every advertisement route permission in the shared menu', () => {
    const menuPermissions = new Set(DEFAULT_ADMIN_MENUS.map(({ permission }) => permission))
    const permissions = new Set<string>()
    const methods = Object.getOwnPropertyNames(C2cAdController.prototype).filter(
      (name) => name !== 'constructor',
    )
    for (const method of methods) {
      const metadata: unknown = Reflect.getMetadata(
        'contract:permission',
        C2cAdController.prototype[method],
      )
      const required =
        typeof metadata === 'object' && metadata !== null && 'anyOf' in metadata
          ? (metadata as { anyOf: string[] }).anyOf
          : Array.isArray(metadata)
            ? metadata
            : [metadata]
      for (const permission of required) {
        expect(menuPermissions.has(permission)).toBe(true)
        permissions.add(permission)
      }
    }
    expect([...permissions].sort()).toEqual(
      [
        'merchant:ad:read',
        'merchant:ad:sync',
        'merchant:ad:rule',
        'merchant:ad:preview',
        'merchant:ad:execute',
        'merchant:ad:start',
        'merchant:ad:stop',
        'merchant:adRun:read',
      ].sort(),
    )
  })

  it('provides only merchant options using advertisement permissions and the resolved tenant', async () => {
    const options = [{ id: merchantId, name: '广告商家', platform: 'BINANCE' }]
    ads.merchantOptions.mockResolvedValue(options)
    const response = await request(app.getHttpServer())
      .get('/v1/sys/merchant-ad-options/merchants')
      .query({ tenantId })
      .expect(200)
    expectWrappedSuccess(response.body)
    expect(response.body.data).toEqual(options)
    expect(ads.merchantOptions).toHaveBeenCalledWith(tenantId)
    expect(
      Reflect.getMetadata('contract:permission', C2cAdController.prototype.merchantOptions),
    ).toEqual({
      anyOf: ['merchant:ad:read', 'merchant:ad:sync', 'merchant:ad:rule', 'merchant:adRun:read'],
    })
  })

  it('rejects another tenant before reading merchant options', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/sys/merchant-ad-options/merchants')
      .query({ tenantId: otherTenantId })
      .expect(403)
    expectWrappedError(response.body, 403)
    expect(ads.merchantOptions).not.toHaveBeenCalled()
  })

  it('wraps paginated advertisement and run responses with parsed query values', async () => {
    const page = { items: [], total: 0, page: 2, pageSize: 10 }
    ads.list.mockResolvedValue(page)
    ads.listRuns.mockResolvedValue(page)
    const response = await request(app.getHttpServer())
      .get('/v1/sys/merchant-ads')
      .query({ tenantId, merchantId, platform: 'OKX', page: 2, pageSize: 10 })
      .expect(200)
    const runsResponse = await request(app.getHttpServer())
      .get('/v1/sys/merchant-ad-runs')
      .query({ tenantId, merchantId, adId, page: 2, pageSize: 10 })
      .expect(200)

    expectWrappedSuccess(response.body)
    expectWrappedSuccess(runsResponse.body)
    expect(response.body.data).toEqual(page)
    expect(runsResponse.body.data).toEqual(page)
    expect(ads.list).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ merchantId, platform: 'OKX', page: 2, pageSize: 10 }),
    )
    expect(ads.listRuns).toHaveBeenCalledWith(
      tenantId,
      expect.objectContaining({ merchantId, adId, page: 2, pageSize: 10 }),
    )
  })

  it.each(['/v1/sys/merchant-ads', '/v1/sys/merchant-ad-runs'])(
    'rejects invalid pagination before querying %s',
    async (path) => {
      const response = await request(app.getHttpServer())
        .get(path)
        .query({ tenantId, page: 0, pageSize: 101 })
        .expect(400)
      expectWrappedError(response.body, 400)
      expect(ads.list).not.toHaveBeenCalled()
      expect(ads.listRuns).not.toHaveBeenCalled()
    },
  )

  it('rejects a tenant operator reading or executing another tenant scope', async () => {
    const read = await request(app.getHttpServer())
      .get('/v1/sys/merchant-ads')
      .query({ tenantId: otherTenantId })
      .expect(403)
    const execute = await request(app.getHttpServer())
      .post(`/v1/sys/merchant-ads/${adId}/execute`)
      .send({ tenantId: otherTenantId, merchantId })
      .expect(403)
    expectWrappedError(read.body, 403)
    expectWrappedError(execute.body, 403)
    expect(ads.list).not.toHaveBeenCalled()
    expect(runner.run).not.toHaveBeenCalled()
  })

  it('requires merchantId for single-ad and single-run reads', async () => {
    await request(app.getHttpServer())
      .get(`/v1/sys/merchant-ads/${adId}`)
      .query({ tenantId })
      .expect(400)
    await request(app.getHttpServer())
      .get(`/v1/sys/merchant-ad-runs/${runId}`)
      .query({ tenantId })
      .expect(400)
    expect(ads.detail).not.toHaveBeenCalled()
    expect(ads.runDetail).not.toHaveBeenCalled()
  })

  it.each(['preview', 'execute'])(
    'requires merchantId before dispatching %s',
    async (operation) => {
      await request(app.getHttpServer())
        .post(`/v1/sys/merchant-ads/${adId}/${operation}`)
        .send({ tenantId })
        .expect(400)
      expect(runner.run).not.toHaveBeenCalled()
    },
  )

  it('requires merchantId when saving a strategy', async () => {
    await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({ tenantId, rule: fixedRule() })
      .expect(400)
    expect(ads.saveRule).not.toHaveBeenCalled()
  })

  it.each(['start', 'stop'])(
    'requires merchantId before changing automatic pricing through %s',
    async (operation) => {
      await request(app.getHttpServer())
        .put(`/v1/sys/merchant-ads/${adId}/${operation}`)
        .send({ tenantId })
        .expect(400)
      expect(ads.automation).not.toHaveBeenCalled()
    },
  )

  it('starts and stops the shared automation service through distinct permissions', async () => {
    ads.automation.mockResolvedValue({ id: adId })
    const start = await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/start`)
      .send({ tenantId, merchantId })
      .expect(200)
    const stop = await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/stop`)
      .send({ tenantId, merchantId })
      .expect(200)
    expectWrappedSuccess(start.body)
    expectWrappedSuccess(stop.body)
    expect(ads.automation).toHaveBeenNthCalledWith(1, tenantId, merchantId, adId, true)
    expect(ads.automation).toHaveBeenNthCalledWith(2, tenantId, merchantId, adId, false)
    expect(Reflect.getMetadata('contract:permission', C2cAdController.prototype.start)).toBe(
      'merchant:ad:start',
    )
    expect(Reflect.getMetadata('contract:permission', C2cAdController.prototype.stop)).toBe(
      'merchant:ad:stop',
    )
  })

  it('saves nested strategy amounts as strings and strips unknown fields', async () => {
    ads.saveRule.mockResolvedValue({ id: adId, rule: fixedRule(), ruleVersion: 1 })
    const response = await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({
        tenantId,
        merchantId,
        rule: {
          ...fixedRule(),
          priceTick: '0.001',
          checkTradability: true,
          unsupportedSetting: 'discard',
        },
      })
      .expect(200)
    expectWrappedSuccess(response.body)
    expect(response.body.data.rule.fixedLimit).toBe('7.10')
    expect(ads.saveRule).toHaveBeenCalledWith(tenantId, merchantId, adId, fixedRule())
  })

  it('saves a complete dynamic strategy without requiring its own nickname', async () => {
    const rule = {
      ...fixedRule(),
      mode: 'DYNAMIC',
      fixedLimit: null,
      profitPerUsdt: '0.05',
      feePercent: '0.11',
      referencePaymentMethods: ['BANK'],
    }
    ads.saveRule.mockResolvedValue({ id: adId, rule, ruleVersion: 2 })
    const response = await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({ tenantId, merchantId, rule })
      .expect(200)
    expectWrappedSuccess(response.body)
    expect(response.body.data.rule).toEqual(rule)
    expect(ads.saveRule).toHaveBeenCalledWith(tenantId, merchantId, adId, rule)
  })

  it('ignores the obsolete own nickname from older clients', async () => {
    const rule = fixedRule()
    ads.saveRule.mockResolvedValue({ id: adId, rule, ruleVersion: 2 })
    await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({ tenantId, merchantId, rule: { ...rule, ownNickname: '旧昵称' } })
      .expect(200)
    expect(ads.saveRule).toHaveBeenCalledWith(tenantId, merchantId, adId, rule)
    expect(ads.saveRule.mock.calls[0][3]).not.toHaveProperty('ownNickname')
  })

  it.each([
    { mode: 'OTHER' },
    { step: 0.01 },
    { fixedLimit: 7.1 },
    { merchantOnly: 'false' },
    { excludeInactive: 'false' },
    { linkedAdId: 'invalid-ad-id' },
    { linkedAdId: adId, linkedDiscount: 0.01 },
    { linkedAdId: adId, linkedDiscount: null },
    { referencePosition: 0 },
    { competitorPaymentMethods: ['ALIPAY', 'ALIPAY'] },
    { mode: 'DYNAMIC', fixedLimit: null, profitPerUsdt: null, feePercent: '0.11' },
  ])('rejects invalid nested strategy values: %j', async (patch) => {
    const response = await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({ tenantId, merchantId, rule: { ...fixedRule(), ...patch } })
      .expect(400)
    expectWrappedError(response.body, 400)
    expect(ads.saveRule).not.toHaveBeenCalled()
  })

  it('requires a nested strategy object', async () => {
    await request(app.getHttpServer())
      .put(`/v1/sys/merchant-ads/${adId}/rule`)
      .send({ tenantId, merchantId })
      .expect(400)
    expect(ads.saveRule).not.toHaveBeenCalled()
  })

  it('dispatches preview and manual execution through the same runner with distinct triggers', async () => {
    runner.run.mockResolvedValue({ id: runId, status: 'READY', targetPrice: '7.10' })
    const preview = await request(app.getHttpServer())
      .post(`/v1/sys/merchant-ads/${adId}/preview`)
      .send({ tenantId, merchantId })
      .expect(201)
    const execute = await request(app.getHttpServer())
      .post(`/v1/sys/merchant-ads/${adId}/execute`)
      .send({ tenantId, merchantId })
      .expect(201)
    expectWrappedSuccess(preview.body)
    expectWrappedSuccess(execute.body)
    expect(runner.run).toHaveBeenNthCalledWith(1, tenantId, merchantId, adId, 'PREVIEW', '7')
    expect(runner.run).toHaveBeenNthCalledWith(2, tenantId, merchantId, adId, 'MANUAL', '7')
    expect(ads.sync).not.toHaveBeenCalled()
    expect(ads.saveRule).not.toHaveBeenCalled()
  })

  it('synchronizes and reads only the requested merchant scope', async () => {
    ads.sync.mockResolvedValue({ scanned: 3, synced: 2 })
    ads.detail.mockResolvedValue({ id: adId, merchantId, price: '7.10' })
    ads.runDetail.mockResolvedValue({ id: runId, merchantId, status: 'PENDING' })
    await request(app.getHttpServer())
      .post(`/v1/sys/merchants/${merchantId}/ads/sync`)
      .query({ tenantId })
      .expect(201)
    await request(app.getHttpServer())
      .get(`/v1/sys/merchant-ads/${adId}`)
      .query({ tenantId, merchantId })
      .expect(200)
    await request(app.getHttpServer())
      .get(`/v1/sys/merchant-ad-runs/${runId}`)
      .query({ tenantId, merchantId })
      .expect(200)
    expect(ads.sync).toHaveBeenCalledWith(tenantId, merchantId)
    expect(ads.detail).toHaveBeenCalledWith(tenantId, merchantId, adId)
    expect(ads.runDetail).toHaveBeenCalledWith(tenantId, merchantId, runId)
  })
})
