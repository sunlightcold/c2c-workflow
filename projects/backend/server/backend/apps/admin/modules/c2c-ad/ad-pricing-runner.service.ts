import { MerchantAdEntity, MerchantAdRunEntity, type MerchantAdRunTrigger } from '@admin/database'
import { BadRequestException, ConflictException, HttpException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Big from 'big.js'
import { EntityManager, Repository } from 'typeorm'
import {
  C2cCredentialRejectedError,
  C2cPlatformClient,
  C2cRequestRejectedError,
} from '../c2c-platform'
import type { C2cAd, C2cAdMarketQuery, C2cAdMarketSnapshot } from '../c2c-platform/c2c-ad.types'
import { AdLockService } from './ad-lock.service'
import { C2cAdService } from './ad.service'
import { decideAdPrice, linkedAdPrice } from './domain/ad-pricing.engine'
import type { AdPricingInput, PriceDecision } from './domain/ad-pricing.types'

function failureReason(error: unknown): string {
  if (error instanceof C2cCredentialRejectedError) return '平台凭据已失效，请更新商家凭据'
  if (error instanceof C2cRequestRejectedError) {
    if (error.responseCode === 'UNSUPPORTED_AD_PERIOD')
      return '当前平台不支持广告付款时限筛选，请清空该条件'
    if (error.responseCode === 'UNSUPPORTED_AD_TYPE') return '当前平台仅支持固定价格广告调价'
    if (error.responseCode === 'AD_UPDATE_NOT_SUBMITTED')
      return '广告改价准备失败，本次未提交，请重新查询广告后重试'
    return '平台明确拒绝本次广告请求，请检查广告与策略配置'
  }
  if (error instanceof HttpException) return error.message.slice(0, 512)
  return '平台请求失败，请检查商家连接后重试'
}

@Injectable()
export class AdPricingRunner {
  constructor(
    private readonly ads: C2cAdService,
    private readonly locks: AdLockService,
    private readonly platform: C2cPlatformClient,
    @InjectRepository(MerchantAdEntity) private readonly repository: Repository<MerchantAdEntity>,
  ) {}

  async run(
    tenantId: string,
    merchantId: string,
    id: string,
    trigger: MerchantAdRunTrigger,
    createdBy: string | null = null,
  ) {
    const runId = await this.locks.run(tenantId, merchantId, async (manager) => {
      const ad = await this.ads.requireAd(manager, tenantId, merchantId, id)
      if (
        trigger === 'AUTO' &&
        (!ad.nextRunAt || ad.nextRunAt.getTime() > Date.now() || (!ad.enabled && !ad.pendingRunId))
      )
        return null
      if (ad.pendingRunId) {
        const pending = await manager.findOneOrFail(MerchantAdRunEntity, {
          where: { id: ad.pendingRunId, adId: id, tenantId, merchantId },
        })
        if (trigger === 'PREVIEW') return pending.id
        if (pending.status === 'READY') await this.submit(manager, ad, pending)
        else await this.reconcile(manager, ad, pending)
        return pending.id
      }
      await this.ads.assertIndependent(manager, tenantId, merchantId, id)
      if (!ad.rule) throw new BadRequestException('请先保存策略')
      const run = manager.create(MerchantAdRunEntity, {
        tenantId,
        merchantId,
        adId: id,
        ruleVersion: ad.ruleVersion,
        rule: ad.rule,
        trigger,
        status: 'READY',
        currentPrice: ad.price,
        targetPrice: null,
        actualPrice: null,
        platformAdId: ad.platformAdId,
        resultPlatformAdId: null,
        evidence: null,
        reason: '查询行情',
        createdBy,
        finishedAt: null,
      })
      try {
        const session = await this.ads.session(tenantId, merchantId, manager)
        const ownAds = await this.platform.listAds(session.merchant.platform, session.credentials)
        const ownAd = ownAds.find((current) => current.platformAdId === ad.platformAdId)
        if (!ownAd) throw new BadRequestException('平台广告不存在，请重新同步')
        this.ads.applySnapshot(ad, ownAd)
        run.currentPrice = ownAd.price
        run.actualPrice = ownAd.price
        const competitorQuery: C2cAdMarketQuery = {
          asset: 'USDT',
          fiatCurrency: ad.fiatCurrency,
          side: 'BUY',
          amount: ad.rule.competitorAmount,
          paymentMethods: ad.rule.competitorPaymentMethods,
          merchantOnly: ad.rule.merchantOnly,
          periodMinutes: ad.rule.competitorPeriod,
          limit: 20,
        }
        const referenceQuery: C2cAdMarketQuery | null =
          ad.rule.mode === 'DYNAMIC'
            ? {
                asset: 'USDT',
                fiatCurrency: ad.fiatCurrency,
                side: 'SELL',
                amount: '0',
                paymentMethods: ad.rule.referencePaymentMethods,
                merchantOnly: ad.rule.merchantOnly,
                periodMinutes: null,
                limit: 10,
              }
            : null
        const [competitorSnapshot, referenceSnapshot] = await Promise.all([
          this.platform.searchAds(session.merchant.platform, session.credentials, competitorQuery),
          referenceQuery
            ? this.platform.searchAds(
                session.merchant.platform,
                session.credentials,
                referenceQuery,
              )
            : Promise.resolve(null),
        ])
        this.assertFreshMarket(competitorSnapshot, referenceSnapshot)
        const input: AdPricingInput = {
          rule: ad.rule,
          ownAd,
          ownAdIds: ownAds.map((current) => current.platformAdId),
          competitorQuery,
          referenceQuery,
          competitorSnapshot,
          referenceSnapshot,
        }
        const decision = decideAdPrice(input)
        await this.prepareLinked(manager, ad, ownAds, decision)
        run.evidence = decision.evidence
        run.reason = decision.reason
        run.targetPrice = decision.price
        run.status = decision.action === 'UPDATE' ? 'READY' : decision.action
      } catch (error) {
        run.status = 'FAILED'
        run.reason = failureReason(error)
      }
      if (trigger === 'PREVIEW' || run.status !== 'READY') {
        run.finishedAt = new Date()
        if (trigger !== 'PREVIEW') this.schedule(ad, run.status === 'FAILED' ? run.reason : null)
        await this.save(manager, ad, run)
        return run.id
      }

      await this.submit(manager, ad, run)
      return run.id
    })
    return runId ? this.ads.runDetail(tenantId, merchantId, runId) : null
  }

  async runDue() {
    // This scan only discovers scope keys. Every subsequent business read is scoped.
    const due = await this.repository
      .createQueryBuilder('ad')
      .select(['ad.id', 'ad.tenantId', 'ad.merchantId'])
      .where('(ad.enabled = true OR ad.pendingRunId IS NOT NULL)')
      .andWhere('ad.nextRunAt <= :now', { now: new Date() })
      .orderBy('ad.nextRunAt', 'ASC')
      .take(10)
      .getMany()
    const results = await Promise.allSettled(
      due.map((ad) => this.run(ad.tenantId, ad.merchantId, ad.id, 'AUTO')),
    )
    return {
      scanned: due.length,
      completed: results.filter((result) => result.status === 'fulfilled' && result.value !== null)
        .length,
      skipped: results.filter(
        (result) => result.status === 'rejected' && result.reason instanceof ConflictException,
      ).length,
      failed: results.filter(
        (result) => result.status === 'rejected' && !(result.reason instanceof ConflictException),
      ).length,
    }
  }

  private async prepareLinked(
    manager: EntityManager,
    ad: MerchantAdEntity,
    ownAds: C2cAd[],
    decision: PriceDecision,
  ) {
    if (decision.action === 'UPDATE' && ad.rule!.linkedAdId) {
      const linked = await this.ads.requireAd(
        manager,
        ad.tenantId,
        ad.merchantId,
        ad.rule!.linkedAdId!,
      )
      const snapshot = ownAds.find((current) => current.platformAdId === linked.platformAdId)
      if (!snapshot || snapshot.status !== 'ONLINE')
        throw new BadRequestException('副广告不存在或未在线')
      if (linked.enabled || linked.pendingRunId || linked.rule?.linkedAdId)
        throw new ConflictException('副广告存在独立调价或在途任务')
      this.ads.applySnapshot(linked, snapshot)
      const targetPrice = linkedAdPrice(decision.price!, ad.rule!.linkedDiscount!)
      if (new Big(targetPrice).lte(0)) throw new BadRequestException('副广告计算价格不大于 0')
      decision.evidence.linkedAd = {
        adId: linked.id,
        platformAdId: linked.platformAdId,
        currentPrice: linked.price,
        targetPrice,
        discount: ad.rule!.linkedDiscount!,
        runId: null,
      }
    }
  }

  private async submit(manager: EntityManager, ad: MerchantAdEntity, run: MerchantAdRunEntity) {
    let session: Awaited<ReturnType<C2cAdService['session']>>
    // Recheck owner, version and switch immediately before persisting a write intent.
    try {
      session = await this.ads.session(ad.tenantId, ad.merchantId, manager)
      const current = await this.ads.requireAd(manager, ad.tenantId, ad.merchantId, ad.id)
      if (
        current.ruleVersion !== run.ruleVersion ||
        (!run.evidence?.linkedFromRunId && run.trigger === 'AUTO' && !current.enabled)
      )
        throw new ConflictException('策略版本或自动开关已变化，本次不提交')
      this.assertFreshMarket(run.evidence!.competitorSnapshot, run.evidence!.referenceSnapshot)
    } catch (error) {
      run.status = 'BLOCKED'
      run.reason = failureReason(error)
      run.finishedAt = new Date()
      ad.pendingRunId = null
      this.schedule(ad, run.reason)
      await this.save(manager, ad, run)
      return run.id
    }
    run.status = 'PENDING'
    run.reason = '已记录改价请求，等待平台价格核实'
    await manager.transaction(async (transaction) => {
      await transaction.save(run)
      ad.pendingRunId = run.id
      this.schedule(ad, null)
      await transaction.save(ad)
    })
    try {
      const result = await this.platform.updateAdPrice(
        session!.merchant.platform,
        session!.credentials,
        ad.platformAdId,
        run.targetPrice!,
      )
      run.resultPlatformAdId = result.platformAdId
      // Commit the returned ID before readback: OKX may replace the public ID.
      await manager.save(run)
    } catch (error) {
      if (error instanceof C2cRequestRejectedError || error instanceof C2cCredentialRejectedError) {
        run.status = 'FAILED'
        run.reason = failureReason(error)
        run.finishedAt = new Date()
        ad.pendingRunId = null
        this.schedule(ad, run.reason)
        await this.save(manager, ad, run)
        return run.id
      }
      // Transport failure is not proof of rejection. Only readback may resolve it.
    }
    await this.reconcile(manager, ad, run)
    return run.id
  }

  private async reconcile(manager: EntityManager, ad: MerchantAdEntity, run: MerchantAdRunEntity) {
    let linkedRun: MerchantAdRunEntity | null = null
    let linkedAd: MerchantAdEntity | null = null
    try {
      const { merchant, credentials } = await this.ads.session(ad.tenantId, ad.merchantId, manager)
      const current = await this.platform.getAd(
        merchant.platform,
        credentials,
        run.resultPlatformAdId ?? run.platformAdId,
      )
      this.ads.applySnapshot(ad, current)
      run.actualPrice = current.price
      if (new Big(current.price).eq(run.targetPrice!)) {
        const linked = run.evidence?.linkedAd
        if (linked && !linked.runId) {
          linkedAd = await this.ads.requireAd(manager, ad.tenantId, ad.merchantId, linked.adId)
          if (linkedAd.enabled || linkedAd.pendingRunId)
            throw new ConflictException('副广告正在独立调价，请先处理副广告')
          linkedRun = manager.create(MerchantAdRunEntity, {
            tenantId: ad.tenantId,
            merchantId: ad.merchantId,
            adId: linkedAd.id,
            ruleVersion: linkedAd.ruleVersion,
            rule: run.rule,
            trigger: run.trigger,
            status: 'READY',
            currentPrice: linked.currentPrice,
            targetPrice: linked.targetPrice,
            actualPrice: linked.currentPrice,
            platformAdId: linkedAd.platformAdId,
            resultPlatformAdId: null,
            evidence: { ...run.evidence!, linkedAd: null, linkedFromRunId: run.id },
            reason: '主广告已生效，等待提交副广告折扣价',
            createdBy: run.createdBy,
            finishedAt: null,
          })
        }
        run.status = 'APPLIED'
        run.reason = '平台回查价格已与目标价一致'
        run.finishedAt = new Date()
        ad.pendingRunId = null
        this.schedule(ad, null)
      } else {
        run.reason = '平台回查价格尚未与目标价一致；后续只回查，不再提交'
        this.schedule(ad, run.reason)
      }
    } catch {
      run.reason = '平台回查失败，改价结果待核实；后续只回查，不再提交'
      this.schedule(ad, run.reason)
    }
    await manager.transaction(async (transaction) => {
      if (linkedRun && linkedAd) {
        await transaction.save(linkedRun)
        run.evidence!.linkedAd!.runId = linkedRun.id
        linkedAd.pendingRunId = linkedRun.id
        linkedAd.nextRunAt = new Date()
        await transaction.save(linkedAd)
      }
      await transaction.save(run)
      await transaction.save(ad)
    })
    if (linkedRun && linkedAd) await this.submit(manager, linkedAd, linkedRun)
  }

  private schedule(ad: MerchantAdEntity, error: string | null) {
    ad.lastError = error
    ad.nextRunAt =
      ad.enabled || ad.pendingRunId
        ? new Date(Date.now() + (ad.rule?.intervalSeconds ?? 60) * 1000)
        : null
  }

  private assertFreshMarket(...snapshots: Array<C2cAdMarketSnapshot | null>) {
    if (
      snapshots.some((snapshot) => snapshot && Date.now() - Date.parse(snapshot.fetchedAt) > 60_000)
    )
      throw new BadRequestException('行情已超过 60 秒，请重新查询')
  }

  private save(manager: EntityManager, ad: MerchantAdEntity, run: MerchantAdRunEntity) {
    return manager.transaction(async (transaction) => {
      await transaction.save(run)
      await transaction.save(ad)
    })
  }
}
