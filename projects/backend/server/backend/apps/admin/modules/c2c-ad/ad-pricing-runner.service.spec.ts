import { MerchantAdEntity, MerchantAdRunEntity, MerchantPlatform } from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { type EntityManager, Repository } from 'typeorm'
import type { C2cPlatformClient } from '../c2c-platform'
import { C2cRequestRejectedError } from '../c2c-platform'
import type { AdLockService } from './ad-lock.service'
import { C2cAdService } from './ad.service'
import { AdPricingRunner } from './ad-pricing-runner.service'
import { pricingInput } from './domain/ad-pricing.fixture'
import { decideAdPrice } from './domain/ad-pricing.engine'

function setup() {
  const input = pricingInput()
  let storedAd: MerchantAdEntity = Object.assign(new MerchantAdEntity(), {
    id: 'ad',
    tenantId: 'tenant',
    merchantId: 'merchant',
    platform: MerchantPlatform.BINANCE,
    ...input.ownAd,
    rule: input.rule,
    ruleVersion: 1,
    enabled: true,
    pendingRunId: null,
    nextRunAt: new Date(0),
  })
  const storedRuns = new Map<string, MerchantAdRunEntity>()
  const events: string[] = []
  let currentPrice = input.ownAd.price
  let currentId = 'own'
  const manager = {
    create: (_type: unknown, data: Partial<MerchantAdRunEntity>) =>
      Object.assign(new MerchantAdRunEntity(), data),
    save: jest.fn(async (entity: MerchantAdEntity | MerchantAdRunEntity) => {
      if ('adId' in entity) {
        entity.id ||= `run-${storedRuns.size + 1}`
        storedRuns.set(entity.id, structuredClone(entity))
        events.push(`run:${entity.status}`)
      } else {
        storedAd = Object.assign(new MerchantAdEntity(), structuredClone(entity))
        events.push(`ad:${entity.pendingRunId ?? 'none'}`)
      }
      return entity
    }),
    transaction: async (work: (transaction: EntityManager) => Promise<unknown>) =>
      work(manager as unknown as EntityManager),
    findOneOrFail: async (
      _type: unknown,
      options: { where: { id: string; tenantId: string; merchantId: string; adId: string } },
    ) => {
      expect(options.where).toMatchObject({
        tenantId: 'tenant',
        merchantId: 'merchant',
        adId: 'ad',
      })
      return structuredClone(storedRuns.get(options.where.id)!)
    },
  }
  const ads = {
    assertIndependent: jest.fn(async () => {}),
    requireAd: jest.fn(
      async (_manager: EntityManager, tenant: string, merchant: string, id: string) => {
        expect([tenant, merchant, id]).toEqual(['tenant', 'merchant', 'ad'])
        return Object.assign(new MerchantAdEntity(), structuredClone(storedAd))
      },
    ),
    session: jest.fn(async () => ({
      merchant: { platform: MerchantPlatform.BINANCE },
      credentials: {},
    })),
    applySnapshot: C2cAdService.prototype.applySnapshot,
    runDetail: jest.fn(async (_tenant: string, _merchant: string, id: string) =>
      structuredClone(storedRuns.get(id)!),
    ),
  }
  const platform = {
    listAds: jest.fn(async () => [
      { ...input.ownAd, platformAdId: currentId, price: currentPrice },
    ]),
    getAd: jest.fn(async (_platform: unknown, _credentials: unknown, id: string) => {
      expect(id).toBe(currentId)
      return { ...input.ownAd, platformAdId: currentId, price: currentPrice }
    }),
    searchAds: jest.fn(async () => ({
      ...input.competitorSnapshot,
      fetchedAt: new Date().toISOString(),
    })),
    updateAdPrice: jest.fn(
      async (_platform: unknown, _credentials: unknown, _id: string, price: string) => {
        events.push('upstream:write')
        expect(storedAd.pendingRunId).not.toBeNull()
        expect(storedRuns.get(storedAd.pendingRunId!)?.status).toBe('PENDING')
        currentPrice = price
        return { platformAdId: currentId }
      },
    ),
  }
  const locks = {
    run: async (
      _tenant: string,
      _merchant: string,
      work: (manager: EntityManager) => Promise<unknown>,
    ) => work(manager as unknown as EntityManager),
  }
  const runner = new AdPricingRunner(
    ads as unknown as C2cAdService,
    locks as unknown as AdLockService,
    platform as unknown as C2cPlatformClient,
    new Repository(MerchantAdEntity, manager as unknown as EntityManager),
  )
  return {
    runner,
    ads,
    platform,
    events,
    ad: () => storedAd,
    runs: storedRuns,
    price: (price: string) => {
      currentPrice = price
    },
    publicId: (id: string) => {
      currentId = id
    },
  }
}

describe('shared ad pricing execution', () => {
  it('recovers a durable READY linked run without enabling independent pricing or writing during preview', async () => {
    const { runner, platform, ad, runs } = setup()
    const input = pricingInput()
    const ready = Object.assign(new MerchantAdRunEntity(), {
      id: 'linked-ready',
      tenantId: 'tenant',
      merchantId: 'merchant',
      adId: 'ad',
      ruleVersion: 1,
      rule: input.rule,
      trigger: 'AUTO',
      status: 'READY',
      platformAdId: 'own',
      targetPrice: '7.02',
      currentPrice: '7.05',
      actualPrice: '7.05',
      evidence: { ...decideAdPrice(input).evidence, linkedFromRunId: 'main-applied' },
    })
    runs.set(ready.id, ready)
    Object.assign(ad(), { enabled: false, rule: null, pendingRunId: ready.id })
    expect(await runner.run('tenant', 'merchant', 'ad', 'PREVIEW')).toMatchObject({
      status: 'READY',
    })
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
    expect(await runner.run('tenant', 'merchant', 'ad', 'AUTO')).toMatchObject({
      status: 'APPLIED',
      targetPrice: '7.02',
    })
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
    expect(ad().pendingRunId).toBeNull()
    expect(ad().enabled).toBe(false)
  })
  it('previews using the shared engine and never submits', async () => {
    const { runner, platform, ad } = setup()
    expect(await runner.run('tenant', 'merchant', 'ad', 'PREVIEW')).toMatchObject({
      status: 'READY',
      targetPrice: '7.1',
    })
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
    expect(ad().pendingRunId).toBeNull()
    expect(ad().nextRunAt).toEqual(new Date(0))
  })

  it('commits pending intent before write and confirms only by readback', async () => {
    const { runner, platform, ad, events } = setup()
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'APPLIED',
      targetPrice: '7.1',
      actualPrice: '7.1',
    })
    expect(events.indexOf('run:PENDING')).toBeLessThan(events.indexOf('upstream:write'))
    expect(events.indexOf('ad:run-1')).toBeLessThan(events.indexOf('upstream:write'))
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
    expect(ad().pendingRunId).toBeNull()
  })

  it('timeout plus price mismatch stays durable and subsequent manual runs only read back', async () => {
    const { runner, platform, ad, runs, price } = setup()
    platform.updateAdPrice.mockRejectedValueOnce(new Error('request timed out; secret=value'))
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'PENDING',
      actualPrice: '7.05',
    })
    expect(ad().pendingRunId).toBe('run-1')
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'PENDING',
    })
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
    expect(runs.size).toBe(1)
    price('7.1')
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'APPLIED',
    })
    expect(ad().pendingRunId).toBeNull()
    expect(JSON.stringify([...runs.values()])).not.toContain('secret=value')
  })

  it('recognizes a timed-out write that was applied without sending it again', async () => {
    const { runner, platform, price } = setup()
    platform.updateAdPrice.mockImplementationOnce(async () => {
      price('7.1')
      throw new Error('timeout')
    })
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'APPLIED',
    })
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
  })

  it('persists returned replacement ad ID before readback and rebinds after confirmation', async () => {
    const { runner, platform, publicId, price, ad, runs } = setup()
    platform.updateAdPrice.mockImplementationOnce(async () => {
      publicId('new-public-id')
      price('7.1')
      return { platformAdId: 'new-public-id' }
    })
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'APPLIED',
      platformAdId: 'own',
      resultPlatformAdId: 'new-public-id',
    })
    expect(platform.getAd).toHaveBeenLastCalledWith(MerchantPlatform.BINANCE, {}, 'new-public-id')
    expect(ad().platformAdId).toBe('new-public-id')
    expect(runs.get('run-1')?.resultPlatformAdId).toBe('new-public-id')
  })

  it('explicit rejection fails and clears pending, without readback or retry', async () => {
    const { runner, platform, ad } = setup()
    platform.updateAdPrice.mockRejectedValueOnce(new C2cRequestRejectedError('rejected', 'DENIED'))
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
    })
    expect(platform.getAd).not.toHaveBeenCalled()
    expect(ad().pendingRunId).toBeNull()
  })

  it('a failed write preparation clears pending and permits a subsequent execution', async () => {
    const { runner, platform, ad } = setup()
    platform.updateAdPrice.mockRejectedValueOnce(
      new C2cRequestRejectedError('private preparation error', 'AD_UPDATE_NOT_SUBMITTED'),
    )
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
      reason: '广告改价准备失败，本次未提交，请重新查询广告后重试',
    })
    expect(ad().pendingRunId).toBeNull()
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'APPLIED',
    })
  })

  it('a query failure cannot submit and uses a safe failure reason', async () => {
    const { runner, platform } = setup()
    platform.searchAds.mockRejectedValueOnce(new Error('cookie=private'))
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
      evidence: null,
      reason: '平台请求失败，请检查商家连接后重试',
    })
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
  })

  it('does not query prices or submit when its own-ad list cannot be read', async () => {
    const { runner, platform } = setup()
    platform.listAds.mockRejectedValueOnce(new Error('credential=private'))
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
      evidence: null,
    })
    expect(platform.searchAds).not.toHaveBeenCalled()
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
  })

  it('requires the current ad to belong to the platform account', async () => {
    const { runner, platform } = setup()
    platform.listAds.mockResolvedValueOnce([])
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
      reason: '平台广告不存在，请重新同步',
    })
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
  })

  it('reports an unsupported query condition without presenting it as a connection failure', async () => {
    const { runner, platform } = setup()
    platform.searchAds.mockRejectedValueOnce(
      new C2cRequestRejectedError('欧易广告行情不支持付款时限筛选', 'UNSUPPORTED_AD_PERIOD'),
    )
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'FAILED',
      reason: '当前平台不支持广告付款时限筛选，请清空该条件',
    })
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
  })

  it('an owner disabled during query blocks before submission', async () => {
    const { runner, platform, ads } = setup()
    ads.session
      .mockResolvedValueOnce({ merchant: { platform: MerchantPlatform.BINANCE }, credentials: {} })
      .mockRejectedValueOnce(new BadRequestException('商家已停用'))
    expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
      status: 'BLOCKED',
    })
    expect(platform.searchAds).toHaveBeenCalledTimes(1)
    expect(platform.updateAdPrice).not.toHaveBeenCalled()
  })

  it('rechecks market freshness after resolving the submission session', async () => {
    const { runner, platform, ads } = setup()
    const now = Date.now()
    const clock = jest.spyOn(Date, 'now')
    ads.session
      .mockResolvedValueOnce({ merchant: { platform: MerchantPlatform.BINANCE }, credentials: {} })
      .mockImplementationOnce(async () => {
        clock.mockReturnValue(now + 61_000)
        return { merchant: { platform: MerchantPlatform.BINANCE }, credentials: {} }
      })
    try {
      expect(await runner.run('tenant', 'merchant', 'ad', 'MANUAL')).toMatchObject({
        status: 'BLOCKED',
        reason: '行情已超过 60 秒，请重新查询',
      })
      expect(platform.updateAdPrice).not.toHaveBeenCalled()
    } finally {
      clock.mockRestore()
    }
  })

  it('ignores duplicate automatic ticks once the next execution has been scheduled', async () => {
    const { runner, platform } = setup()
    await runner.run('tenant', 'merchant', 'ad', 'AUTO')
    expect(await runner.run('tenant', 'merchant', 'ad', 'AUTO')).toBeNull()
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
  })

  it('a paused pending ad still recovers on the next automatic tick', async () => {
    const { runner, platform, ad, price } = setup()
    platform.updateAdPrice.mockRejectedValueOnce(new Error('timeout'))
    await runner.run('tenant', 'merchant', 'ad', 'MANUAL')
    ad().enabled = false
    ad().nextRunAt = new Date(0)
    price('7.1')
    expect(await runner.run('tenant', 'merchant', 'ad', 'AUTO')).toMatchObject({
      status: 'APPLIED',
    })
    expect(ad().nextRunAt).toBeNull()
    expect(platform.updateAdPrice).toHaveBeenCalledTimes(1)
  })
})
