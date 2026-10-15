/// <reference types="jest" />

import {
  MerchantAdEntity,
  MerchantAdRunEntity,
  MerchantEntity,
  MerchantPlatform,
  TenantEntity,
} from '@/apps/admin/database'
import { adminMigrations } from '@/apps/admin/database/migrations'
import { C2C_FOUNDATION_IDS } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import type { MerchantPlatformCredentialService } from '@/apps/admin/modules/business/merchant-platform-credential.service'
import { AdLockService } from '@/apps/admin/modules/c2c-ad/ad-lock.service'
import { AdPricingRunner } from '@/apps/admin/modules/c2c-ad/ad-pricing-runner.service'
import { C2cAdService } from '@/apps/admin/modules/c2c-ad/ad.service'
import type { UnifiedAdRule } from '@/apps/admin/modules/c2c-ad/domain/ad-pricing.types'
import { AxiosC2cHttpTransport } from '@/apps/admin/modules/c2c-platform/axios-c2c-http.transport'
import { BinanceC2cClient } from '@/apps/admin/modules/c2c-platform/binance-c2c.client'
import { C2cPlatformClient } from '@/apps/admin/modules/c2c-platform/c2c-platform.client'
import { C2cPlatformCredentialFactory } from '@/apps/admin/modules/c2c-platform/c2c-platform-credential.factory'
import type {
  C2cHttpRequest,
  C2cHttpTransport,
} from '@/apps/admin/modules/c2c-platform/c2c-platform.types'
import { OkxWebPrivateClient } from '@/apps/admin/modules/c2c-platform/okx-web-private.client'
import developmentConfig from '@/config/development'
import { ConflictException } from '@nestjs/common'
import Big from 'big.js'
import { DataSource } from 'typeorm'

const mockOrigin = 'http://127.0.0.1:13002'
const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
const merchantIds = {
  BINANCE: '36000000-0000-4000-8000-000000000001',
  OKX: '36000000-0000-4000-8000-000000000002',
}
const platforms = [MerchantPlatform.BINANCE, MerchantPlatform.OKX]
const rule: UnifiedAdRule = {
  mode: 'DYNAMIC',
  step: '0.01',
  competitorAmount: '1000',
  competitorPaymentMethods: ['BANK'],
  competitorPeriod: null,
  merchantOnly: true,
  followNickname: null,
  blockedNicknames: [],
  fixedLimit: null,
  profitPerUsdt: '0.08',
  feePercent: '0',
  referencePaymentMethods: ['BANK'],
  referencePosition: 1,
  intervalSeconds: 30,
}

/** Real HTTP with controlled response loss after the upstream has accepted a write. */
class ObservedAdTransport implements C2cHttpTransport {
  readonly writes: string[] = []
  beforeWrite?: () => Promise<void>
  loseNextWriteResponse = false
  private readonly http = new AxiosC2cHttpTransport()

  async request<T>(request: C2cHttpRequest): Promise<T> {
    const path = new URL(request.url).pathname
    const isWrite = path.endsWith('/ads/update') || path.endsWith('/tradingOrders/modify')
    if (isWrite) {
      this.writes.push(path)
      await this.beforeWrite?.()
    }
    const response = await this.http.request<T>(request)
    if (isWrite && this.loseNextWriteResponse) {
      this.loseNextWriteResponse = false
      throw new Error('模拟上游已改价但响应丢失')
    }
    return response
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function mock<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${mockOrigin}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error(`Mock ${path} 返回 ${response.status}`)
  return response.json() as Promise<T>
}

describe('Unified merchant advertisement pricing database integration', () => {
  jest.setTimeout(20_000)
  const { postgres } = developmentConfig.admin
  const schema = `merchant_ad_pricing_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let ads: C2cAdService
  let runner: AdPricingRunner
  let transport: ObservedAdTransport
  let platformClient: C2cPlatformClient

  beforeAll(async () => {
    await expect(mock<{ status: string }>('/api/mock/health')).resolves.toMatchObject({
      status: 'ok',
    })
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      entities: [TenantEntity, MerchantEntity, MerchantAdEntity, MerchantAdRunEntity],
      migrations: adminMigrations,
      migrationsTableName: 'schema_migrations',
      migrationsTransactionMode: 'each',
      extra: {
        max: 2,
        connectionTimeoutMillis: 1000,
        options: `-c search_path=${schema},public`,
      },
    })
    await dataSource.initialize()
    await dataSource.runMigrations()
    await dataSource.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform, "apiBaseUrl")
       VALUES ($1, $3, 'ad-binance', '币安广告商家', 'BINANCE', $4),
              ($2, $3, 'ad-okx', '欧易广告商家', 'OKX', $4)`,
      [merchantIds.BINANCE, merchantIds.OKX, tenantId, mockOrigin],
    )
  })

  beforeEach(async () => {
    await dataSource.query('TRUNCATE merchant_ad_run, merchant_ad')
    await Promise.all(
      ['binance-c2c', 'okx-c2c'].map((provider) =>
        mock(`/api/mock/${provider}/ads`, { method: 'DELETE' }),
      ),
    )
    transport = new ObservedAdTransport()
    platformClient = new C2cPlatformClient(
      new BinanceC2cClient(transport),
      new OkxWebPrivateClient(transport),
    )
    const credentials = {
      getActiveReference: jest.fn(async (requestedTenant: string, merchantId: string) => {
        expect(requestedTenant).toBe(tenantId)
        const platform = merchantId === merchantIds.BINANCE ? 'BINANCE' : 'OKX'
        return {
          credentialRef: platform,
          apiBaseUrl: mockOrigin,
          clientType: platform === 'BINANCE' ? 'WEB' : null,
          xUserId: null,
          requestTimeoutMs: 5000,
        }
      }),
    }
    const locks = new AdLockService(dataSource)
    ads = new C2cAdService(
      dataSource.getRepository(MerchantAdEntity),
      dataSource.getRepository(MerchantAdRunEntity),
      dataSource.getRepository(MerchantEntity),
      credentials as unknown as MerchantPlatformCredentialService,
      {
        resolve: async (reference) =>
          reference === 'BINANCE'
            ? {
                apiKey: 'mock-binance-api-key',
                secretKey: 'mock-binance-secret-key',
              }
            : {
                cookie: 'token=mock-okx-token; sid=mock-okx-session',
                authorization: 'Bearer mock-okx-authorization',
                signaturePrivateKey: 'unused-by-advertisements',
              },
      },
      new C2cPlatformCredentialFactory(),
      platformClient,
      locks,
    )
    runner = new AdPricingRunner(
      ads,
      locks,
      platformClient,
      dataSource.getRepository(MerchantAdEntity),
    )
  })

  afterAll(async () => {
    await mock('/api/mock/c2c-ads/reset', { method: 'POST' })
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('returns only advertisement merchant options within the requested tenant', async () => {
    const options = await ads.merchantOptions(tenantId)
    expect(options).toHaveLength(2)
    expect(options).toEqual(
      expect.arrayContaining([
        { id: merchantIds.BINANCE, name: '币安广告商家', platform: 'BINANCE' },
        { id: merchantIds.OKX, name: '欧易广告商家', platform: 'OKX' },
      ]),
    )
    await expect(ads.merchantOptions('36000000-0000-4000-8000-000000000099')).resolves.toEqual([])
  })

  async function bind(platform: MerchantPlatform) {
    const provider = platform === MerchantPlatform.BINANCE ? 'binance-c2c' : 'okx-c2c'
    const own = {
      id: `${platform}-own`,
      isOwn: true,
      asset: 'USDT',
      fiatCurrency: 'CNY',
      side: 'BUY',
      price: '7.05',
      status: 'ONLINE',
      availableAmount: '123.456789',
      minFiatAmount: '100',
      maxFiatAmount: '5000',
      paymentMethods: ['BANK'],
      receiptIds: ['90000000000000000003'],
      isMerchant: true,
      periodMinutes: 15,
      traderNickname: '自己',
      ...(platform === MerchantPlatform.OKX ? { nextPlatformAdId: 'OKX-replacement' } : {}),
    }
    for (const ad of [
      own,
      ...[
        ['A', '7.08'],
        ['B', '7.09'],
        ['C', '7.12'],
      ].map(([id, price]) => ({
        ...own,
        id,
        price,
        isOwn: false,
        traderNickname: `同行 ${id}`,
      })),
      {
        ...own,
        id: 'reference',
        side: 'SELL',
        price: '7.20',
        isOwn: false,
        traderNickname: '卖币参考',
      },
    ])
      await mock(`/api/mock/${provider}/ads`, { method: 'POST', body: JSON.stringify(ad) })
    const merchantId = merchantIds[platform]
    await expect(ads.sync(tenantId, merchantId)).resolves.toEqual({ scanned: 1, synced: 1 })
    const ad = await dataSource.getRepository(MerchantAdEntity).findOneByOrFail({
      tenantId,
      merchantId,
      platformAdId: own.id,
    })
    await ads.saveRule(tenantId, merchantId, ad.id, rule)
    return { ad, merchantId, provider }
  }

  it.each(platforms)(
    '%s uses the same dynamic preview, writes once and verifies the platform price',
    async (platform) => {
      const { ad, merchantId } = await bind(platform)
      await expect(
        ads.saveRule(tenantId, merchantId, ad.id, { ...rule, step: '0.001' }),
      ).rejects.toThrow('加价格子必须是 0.01 的正整数倍')
      const preview = await runner.run(tenantId, merchantId, ad.id, 'PREVIEW')
      expect(preview).toMatchObject({
        status: 'READY',
        evidence: { limit: '7.12', selected: { traderNickname: '同行 B' } },
      })
      expect(new Big(preview!.targetPrice!).eq('7.10')).toBe(true)
      expect(transport.writes).toHaveLength(0)
      const applied = await runner.run(tenantId, merchantId, ad.id, 'MANUAL')
      expect(applied).toMatchObject({ status: 'APPLIED' })
      expect(new Big(applied!.actualPrice!).eq('7.10')).toBe(true)
      const current = await dataSource.getRepository(MerchantAdEntity).findOneByOrFail({
        tenantId,
        merchantId,
        id: ad.id,
      })
      expect(current.pendingRunId).toBeNull()
      expect(current.platformAdId).toBe(
        platform === MerchantPlatform.OKX ? 'OKX-replacement' : ad.platformAdId,
      )
      const repeated = await runner.run(tenantId, merchantId, ad.id, 'MANUAL')
      expect(repeated).toMatchObject({ status: 'HOLD' })
      expect(transport.writes).toHaveLength(1)
    },
  )

  it('filters inactive Binance peers using real HTTP', async () => {
    const { ad, merchantId, provider } = await bind(MerchantPlatform.BINANCE)
    const market = await mock<Array<Record<string, unknown>>>(`/api/mock/${provider}/ads`)
    const updatePeer = async (values: Record<string, unknown>) => {
      await mock(`/api/mock/${provider}/ads`, { method: 'DELETE' })
      for (const item of market)
        await mock(`/api/mock/${provider}/ads`, {
          method: 'POST',
          body: JSON.stringify(item.id === 'B' ? { ...item, ...values } : item),
        })
    }
    await ads.saveRule(tenantId, merchantId, ad.id, { ...rule, excludeInactive: true })
    await updatePeer({ activeSeconds: 1201 })
    const inactive = await runner.run(tenantId, merchantId, ad.id, 'PREVIEW')
    expect(new Big(inactive!.targetPrice!).eq('7.09')).toBe(true)
    expect(inactive).toMatchObject({
      evidence: {
        candidates: expect.arrayContaining([
          expect.objectContaining({
            quote: expect.objectContaining({ platformAdId: 'B', activeSeconds: 1201 }),
            eligible: false,
            reason: '同行超过 20 分钟未活跃',
          }),
        ]),
      },
    })
    expect(transport.writes).toHaveLength(0)
  })

  async function bindLinked(platform: MerchantPlatform) {
    const { ad, merchantId, provider } = await bind(platform)
    const market = await mock<Array<Record<string, unknown>>>(`/api/mock/${provider}/ads`)
    const own = market.find((item) => item.id === ad.platformAdId)!
    const linkedPlatformId = `${platform}-linked`
    await mock(`/api/mock/${provider}/ads`, {
      method: 'POST',
      body: JSON.stringify({
        ...own,
        id: linkedPlatformId,
        nextPlatformAdId: platform === MerchantPlatform.OKX ? 'OKX-linked-replacement' : undefined,
      }),
    })
    await ads.sync(tenantId, merchantId)
    const linked = await dataSource
      .getRepository(MerchantAdEntity)
      .findOneByOrFail({ tenantId, merchantId, platformAdId: linkedPlatformId })
    await ads.saveRule(tenantId, merchantId, linked.id, rule)
    await ads.saveRule(tenantId, merchantId, ad.id, {
      ...rule,
      linkedAdId: linked.id,
      linkedDiscount: '0.01',
    })
    return { ad, merchantId, linked, provider }
  }

  it.each(platforms)(
    '%s exposes the main relationship across pages and rejects editing the linked strategy',
    async (platform) => {
      const { ad, merchantId, linked } = await bindLinked(platform)
      const detail = await ads.detail(tenantId, merchantId, linked.id)
      expect(detail).toMatchObject({
        pricing: {
          role: 'LINKED',
          mainAd: { id: ad.id, platformAdId: ad.platformAdId, enabled: false },
          discount: '0.01',
        },
      })
      await expect(ads.saveRule(tenantId, merchantId, linked.id, rule)).rejects.toThrow(
        '该广告由主广告联动调价',
      )
      for (const enabled of [true, false])
        await expect(ads.automation(tenantId, merchantId, linked.id, enabled)).rejects.toThrow(
          '该广告由主广告联动调价',
        )
      for (const trigger of ['PREVIEW', 'MANUAL'] as const)
        await expect(runner.run(tenantId, merchantId, linked.id, trigger)).rejects.toThrow(
          '该广告由主广告联动调价',
        )
      for (const page of [1, 2]) {
        const result = await ads.list(tenantId, { merchantId, page, pageSize: 1 })
        expect(result.items).toHaveLength(1)
        expect(result.items[0].pricing.role).toBe(result.items[0].id === ad.id ? 'MAIN' : 'LINKED')
      }
      await ads.saveRule(tenantId, merchantId, ad.id, rule)
      const detached = await ads.detail(tenantId, merchantId, linked.id)
      expect(detached).toMatchObject({ pricing: { role: 'INDEPENDENT' }, enabled: false, rule })
      expect(transport.writes).toHaveLength(0)
    },
  )

  it.each(platforms)(
    '%s applies a linked discount once through the shared submit/readback flow',
    async (platform) => {
      const { ad, merchantId, linked } = await bindLinked(platform)
      await expect(ads.automation(tenantId, merchantId, linked.id, true)).rejects.toThrow(
        '该广告由主广告联动调价',
      )
      const preview = await runner.run(tenantId, merchantId, ad.id, 'PREVIEW')
      expect(preview).toMatchObject({
        status: 'READY',
        evidence: { linkedAd: { adId: linked.id, targetPrice: '7.02', runId: null } },
      })
      expect(transport.writes).toHaveLength(0)
      const applied = await runner.run(tenantId, merchantId, ad.id, 'MANUAL')
      expect(applied).toMatchObject({
        status: 'APPLIED',
        evidence: { linkedAd: { runId: expect.any(String) } },
      })
      const child = await ads.runDetail(tenantId, merchantId, applied!.evidence!.linkedAd!.runId!)
      expect(child.status).toBe('APPLIED')
      expect(new Big(child.actualPrice!).eq('7.02')).toBe(true)
      expect(child.evidence!.linkedFromRunId).toBe(applied!.id)
      expect(transport.writes).toHaveLength(2)
      expect(await runner.run(tenantId, merchantId, ad.id, 'MANUAL')).toMatchObject({
        status: 'HOLD',
      })
      expect(transport.writes).toHaveLength(2)
      await expect(
        ads.saveRule(tenantId, merchantId, linked.id, {
          ...rule,
          linkedAdId: ad.id,
          linkedDiscount: '0.01',
        }),
      ).rejects.toThrow()
    },
  )

  it.each(platforms)('%s automatically excludes all owned BUY and SELL ads', async (platform) => {
    const { ad, merchantId, provider } = await bind(platform)
    const [own] = await mock<Array<Record<string, unknown>>>(`/api/mock/${provider}/ads`)
    for (const side of ['BUY', 'SELL']) {
      await mock(`/api/mock/${provider}/ads`, {
        method: 'POST',
        body: JSON.stringify({
          ...own,
          id: `other-own-${side}`,
          side,
          price: side === 'BUY' ? '7.11' : '6.00',
          traderNickname: '变化后的昵称',
        }),
      })
    }
    const preview = await runner.run(tenantId, merchantId, ad.id, 'PREVIEW')
    expect(preview).toMatchObject({
      status: 'READY',
      evidence: {
        ownAdIds: expect.arrayContaining([ad.platformAdId, 'other-own-BUY', 'other-own-SELL']),
        reference: { traderNickname: '卖币参考' },
        selected: { traderNickname: '同行 B' },
        candidates: expect.arrayContaining([
          expect.objectContaining({
            quote: expect.objectContaining({ platformAdId: 'other-own-BUY' }),
            reason: '自己的广告',
            eligible: false,
          }),
        ]),
      },
    })
    expect(new Big(preview!.targetPrice!).eq('7.10')).toBe(true)
    expect(transport.writes).toHaveLength(0)
  })

  it.each(platforms)(
    '%s keeps a timed-out linked write pending without repeating the main write',
    async (platform) => {
      const { ad, linked, merchantId, provider } = await bindLinked(platform)
      transport.beforeWrite = async () => {
        if (transport.writes.length === 2) throw new Error('副广告请求结果未知')
      }
      const main = await runner.run(tenantId, merchantId, ad.id, 'MANUAL')
      expect(main).toMatchObject({ status: 'APPLIED', linkedRun: { status: 'PENDING' } })
      await expect(ads.saveRule(tenantId, merchantId, ad.id, rule)).rejects.toThrow(
        '副广告仍有在途调价',
      )
      expect(transport.writes).toHaveLength(2)
      const pending = await runner.run(tenantId, merchantId, linked.id, 'MANUAL')
      expect(pending!.status).toBe('PENDING')
      expect(transport.writes).toHaveLength(2)
      expect(await runner.run(tenantId, merchantId, ad.id, 'MANUAL')).toMatchObject({
        status: 'HOLD',
      })
      const records = await mock<Array<Record<string, unknown>>>(`/api/mock/${provider}/ads`)
      await mock(`/api/mock/${provider}/ads`, { method: 'DELETE' })
      for (const record of records)
        await mock(`/api/mock/${provider}/ads`, {
          method: 'POST',
          body: JSON.stringify(
            record.id === linked.platformAdId ? { ...record, price: '7.02' } : record,
          ),
        })
      expect(await runner.run(tenantId, merchantId, linked.id, 'MANUAL')).toMatchObject({
        status: 'APPLIED',
      })
      expect(transport.writes).toHaveLength(2)
      expect(await ads.runDetail(tenantId, merchantId, main!.id)).toMatchObject({
        linkedRun: { status: 'APPLIED' },
      })
    },
  )

  it('completes pricing when the lock holds the last available database connection', async () => {
    const { ad, merchantId } = await bind(MerchantPlatform.BINANCE)
    const occupied = dataSource.createQueryRunner()
    await occupied.connect()
    try {
      await expect(runner.run(tenantId, merchantId, ad.id, 'MANUAL')).resolves.toMatchObject({
        status: 'APPLIED',
      })
      expect(transport.writes).toHaveLength(1)
    } finally {
      await occupied.release()
    }
  })

  it('holds the real merchant lock across the committed pending state and upstream write', async () => {
    const { ad, merchantId } = await bind(MerchantPlatform.BINANCE)
    const entered = deferred()
    const release = deferred()
    transport.beforeWrite = async () => {
      const pendingAd = await dataSource.getRepository(MerchantAdEntity).findOneByOrFail({
        tenantId,
        merchantId,
        id: ad.id,
      })
      expect(pendingAd.pendingRunId).not.toBeNull()
      await expect(
        dataSource.getRepository(MerchantAdRunEntity).findOneByOrFail({
          tenantId,
          merchantId,
          id: pendingAd.pendingRunId!,
        }),
      ).resolves.toMatchObject({ status: 'PENDING' })
      entered.resolve()
      await release.promise
    }
    const first = runner.run(tenantId, merchantId, ad.id, 'MANUAL')
    try {
      await Promise.race([
        entered.promise,
        first.then(() => {
          throw new Error('改价未到达上游写入等待点')
        }),
      ])
      const second = new AdPricingRunner(
        ads,
        new AdLockService(dataSource),
        platformClient,
        dataSource.getRepository(MerchantAdEntity),
      )
      await expect(second.run(tenantId, merchantId, ad.id, 'MANUAL')).rejects.toBeInstanceOf(
        ConflictException,
      )
      await expect(ads.sync(tenantId, merchantId)).rejects.toBeInstanceOf(ConflictException)
    } finally {
      release.resolve()
    }
    await expect(first).resolves.toMatchObject({ status: 'APPLIED' })
    expect(transport.writes).toHaveLength(1)
    await expect(
      dataSource.getRepository(MerchantAdRunEntity).countBy({ tenantId, merchantId, adId: ad.id }),
    ).resolves.toBe(1)
  })

  it('keeps an unknown replacement OKX id pending and prevents sync from creating another binding', async () => {
    const { ad, merchantId, provider } = await bind(MerchantPlatform.OKX)
    transport.loseNextWriteResponse = true
    const pending = await runner.run(tenantId, merchantId, ad.id, 'MANUAL')
    expect(pending).toMatchObject({ status: 'PENDING', resultPlatformAdId: null })
    await expect(
      mock<Array<{ id: string; price: string }>>(`/api/mock/${provider}/ads`),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'OKX-replacement', price: '7.1' })]),
    )
    await expect(ads.sync(tenantId, merchantId)).resolves.toEqual({ scanned: 1, synced: 0 })
    await expect(
      dataSource.getRepository(MerchantAdEntity).findBy({ tenantId, merchantId }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: ad.id,
        platformAdId: ad.platformAdId,
        pendingRunId: pending!.id,
      }),
    ])
    await expect(runner.run(tenantId, merchantId, ad.id, 'MANUAL')).resolves.toMatchObject({
      id: pending!.id,
      status: 'PENDING',
    })
    await expect(ads.automation(tenantId, merchantId, ad.id, true)).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(transport.writes).toHaveLength(1)
    await expect(
      dataSource.getRepository(MerchantAdRunEntity).countBy({ tenantId, merchantId, adId: ad.id }),
    ).resolves.toBe(1)
  })
})
