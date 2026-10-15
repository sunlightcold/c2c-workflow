import {
  BusinessStatus,
  MerchantAdEntity,
  MerchantAdRunEntity,
  MerchantEntity,
  MerchantPlatformCredentialEntity,
  TenantEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import Big from 'big.js'
import { EntityManager, In, Repository } from 'typeorm'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import { C2cPlatformClient, C2cPlatformCredentialFactory } from '../c2c-platform'
import type { C2cAd } from '../c2c-platform/c2c-ad.types'
import { SECRET_RESOLVER, type SecretResolver } from '../system/credential/secret-resolver'
import { AdListDto, AdRunListDto } from './ad.dto'
import { AdLockService } from './ad-lock.service'
import {
  AD_PRICE_TICK,
  type AdPricingRelation,
  type UnifiedAdRule,
} from './domain/ad-pricing.types'

@Injectable()
export class C2cAdService {
  constructor(
    @InjectRepository(MerchantAdEntity) private readonly ads: Repository<MerchantAdEntity>,
    @InjectRepository(MerchantAdRunEntity) private readonly runs: Repository<MerchantAdRunEntity>,
    @InjectRepository(MerchantEntity) private readonly merchants: Repository<MerchantEntity>,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(SECRET_RESOLVER) private readonly secrets: SecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly platform: C2cPlatformClient,
    private readonly locks: AdLockService,
  ) {}

  merchantOptions(tenantId: string) {
    return this.merchants.find({
      select: { id: true, name: true, platform: true },
      where: { tenantId },
      order: { name: 'ASC', id: 'ASC' },
    })
  }

  async list(tenantId: string, dto: AdListDto) {
    const query = this.ads.createQueryBuilder('ad').where('ad.tenantId = :tenantId', { tenantId })
    if (dto.merchantId)
      query.andWhere('ad.merchantId = :merchantId', { merchantId: dto.merchantId })
    if (dto.platform) query.andWhere('ad.platform = :platform', { platform: dto.platform })
    const [items, total] = await query
      .orderBy('ad.createdAt', 'DESC')
      .addOrderBy('ad.id', 'ASC')
      .skip((dto.page - 1) * dto.pageSize)
      .take(dto.pageSize)
      .getManyAndCount()
    return { items: await this.adViews(items), total, page: dto.page, pageSize: dto.pageSize }
  }

  async detail(tenantId: string, merchantId: string, id: string) {
    const ad = await this.requireAd(this.ads.manager, tenantId, merchantId, id)
    return (await this.adViews([ad]))[0]
  }

  async sync(tenantId: string, merchantId: string) {
    return this.locks.run(tenantId, merchantId, async (manager) => {
      const { merchant, credentials } = await this.session(tenantId, merchantId, manager)
      const upstream = await this.platform.listAds(merchant.platform, credentials)
      const ownAds = upstream.filter((ad) => ad.side === 'BUY' && ad.asset === 'USDT')
      const repository = manager.getRepository(MerchantAdEntity)
      const pending = await manager.find(MerchantAdRunEntity, {
        // Keep a non-null column so TypeORM also hydrates runs with an unknown result ID.
        select: { id: true, resultPlatformAdId: true },
        where: { tenantId, merchantId, status: 'PENDING' },
      })
      const pendingIds = new Set(pending.map((run) => run.resultPlatformAdId))
      const hasUnknownPendingId = pending.some((run) => run.resultPlatformAdId === null)
      let synced = 0
      for (const current of ownAds) {
        if (pendingIds.has(current.platformAdId)) continue
        let ad = await repository.findOne({
          where: { tenantId, merchantId, platformAdId: current.platformAdId },
        })
        if (ad?.pendingRunId) continue
        // A timed-out OKX modify may have replaced its public ID. Do not import
        // an unbound ID as a new tradable ad until that write is resolved.
        if (!ad && hasUnknownPendingId) continue
        if (!ad)
          ad = repository.create({
            tenantId,
            merchantId,
            platform: merchant.platform,
            asset: current.asset,
            fiatCurrency: current.fiatCurrency,
            side: 'BUY',
          })
        this.applySnapshot(ad, current)
        await repository.save(ad)
        synced += 1
      }
      return { scanned: upstream.length, synced }
    })
  }

  async saveRule(tenantId: string, merchantId: string, id: string, rule: UnifiedAdRule) {
    if (new Big(rule.step).lte(0) || !new Big(rule.step).mod(AD_PRICE_TICK).eq(0)) {
      throw new BadRequestException('加价格子必须是 0.01 的正整数倍')
    }
    if (rule.mode === 'FIXED' && new Big(rule.fixedLimit!).lte(0))
      throw new BadRequestException('普通买价上限必须大于 0')
    if (rule.mode === 'DYNAMIC' && new Big(rule.feePercent!).gte(100))
      throw new BadRequestException('手续费率必须小于 100%')
    if (rule.followNickname && rule.blockedNicknames.includes(rule.followNickname))
      throw new BadRequestException('指定同行不能是黑名单成员')
    await this.locks.run(tenantId, merchantId, async (manager) => {
      const ad = await this.requireAd(manager, tenantId, merchantId, id)
      if (ad.pendingRunId) throw new ConflictException('仍有待核实调价，请先回查')
      await this.assertIndependent(manager, tenantId, merchantId, id)
      if (ad.rule?.linkedAdId) {
        const linked = await this.requireAd(manager, tenantId, merchantId, ad.rule.linkedAdId)
        if (linked.pendingRunId)
          throw new ConflictException('副广告仍有在途调价，请先回查后修改联动')
      }
      await this.validateLinked(manager, ad, rule)
      ad.rule = {
        ...rule,
        linkedAdId: rule.linkedAdId ?? null,
        linkedDiscount: rule.linkedAdId ? rule.linkedDiscount : null,
        fixedLimit: rule.mode === 'FIXED' ? rule.fixedLimit : null,
        profitPerUsdt: rule.mode === 'DYNAMIC' ? rule.profitPerUsdt : null,
        feePercent: rule.mode === 'DYNAMIC' ? rule.feePercent : null,
      }
      ad.ruleVersion += 1
      if (ad.enabled) ad.nextRunAt = new Date()
      await manager.save(ad)
    })
    return this.detail(tenantId, merchantId, id)
  }

  async automation(tenantId: string, merchantId: string, id: string, enabled: boolean) {
    await this.locks.run(tenantId, merchantId, async (manager) => {
      const ad = await this.requireAd(manager, tenantId, merchantId, id)
      await this.assertIndependent(manager, tenantId, merchantId, id)
      if (enabled) {
        await this.session(tenantId, merchantId, manager)
        if (!ad.rule) throw new BadRequestException('请先保存策略')
        if (ad.pendingRunId) throw new ConflictException('仍有待核实调价，请先回查')
      }
      ad.enabled = enabled
      ad.nextRunAt = enabled || ad.pendingRunId ? new Date() : null
      await manager.save(ad)
    })
    return this.detail(tenantId, merchantId, id)
  }

  async listRuns(tenantId: string, dto: AdRunListDto) {
    const query = this.runs
      .createQueryBuilder('run')
      .innerJoin(
        MerchantAdEntity,
        'ad',
        'ad.id = run.adId AND ad.tenantId = run.tenantId AND ad.merchantId = run.merchantId',
      )
      .where('run.tenantId = :tenantId', { tenantId })
    if (dto.merchantId)
      query.andWhere('run.merchantId = :merchantId', { merchantId: dto.merchantId })
    if (dto.adId) query.andWhere('run.adId = :adId', { adId: dto.adId })
    if (dto.platform) query.andWhere('ad.platform = :platform', { platform: dto.platform })
    const [items, total] = await query
      .orderBy('run.createdAt', 'DESC')
      .addOrderBy('run.id', 'ASC')
      .skip((dto.page - 1) * dto.pageSize)
      .take(dto.pageSize)
      .getManyAndCount()
    return {
      items: await this.runViews(items),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    }
  }

  async assertIndependent(
    manager: EntityManager,
    tenantId: string,
    merchantId: string,
    id: string,
  ) {
    const parent = await manager
      .createQueryBuilder(MerchantAdEntity, 'ad')
      .where('ad.tenantId = :tenantId AND ad.merchantId = :merchantId', { tenantId, merchantId })
      .andWhere("ad.rule ->> 'linkedAdId' = :id", { id })
      .getOne()
    if (parent) throw new ConflictException('该广告由主广告联动调价，请操作主广告')
  }

  async runDetail(tenantId: string, merchantId: string, id: string) {
    const run = await this.runs.findOne({ where: { id, tenantId, merchantId } })
    if (!run) throw new NotFoundException('调价记录不存在')
    return (await this.runViews([run]))[0]
  }

  async requireAd(manager: EntityManager, tenantId: string, merchantId: string, id: string) {
    const ad = await manager.findOne(MerchantAdEntity, { where: { id, tenantId, merchantId } })
    if (!ad) throw new NotFoundException('广告不存在')
    return ad
  }

  async session(tenantId: string, merchantId: string, manager: EntityManager) {
    const merchant = await manager.findOne(MerchantEntity, { where: { id: merchantId, tenantId } })
    const tenant = await manager.findOne(TenantEntity, { where: { id: tenantId } })
    if (!merchant) throw new NotFoundException('商家不存在')
    if (merchant.status !== BusinessStatus.ACTIVE || tenant?.status !== BusinessStatus.ACTIVE)
      throw new BadRequestException('所属单位或商家已停用')
    const reference = await this.credentialService.getActiveReference(
      tenantId,
      merchantId,
      manager.getRepository(MerchantPlatformCredentialEntity),
    )
    const secret = await this.secrets.resolve(reference.credentialRef)
    return {
      merchant,
      credentials: this.credentialFactory.create(merchant.platform, reference, secret),
    }
  }

  applySnapshot(ad: MerchantAdEntity, snapshot: C2cAd) {
    if (
      snapshot.asset !== ad.asset ||
      snapshot.fiatCurrency !== ad.fiatCurrency ||
      snapshot.side !== ad.side
    )
      throw new BadRequestException('平台广告的币种、法币或方向已变化，请重新绑定')
    ad.platformAdId = snapshot.platformAdId
    ad.price = snapshot.price
    ad.status = snapshot.status
    ad.paymentMethods = snapshot.paymentMethods
    ad.availableAmount = snapshot.availableAmount
    ad.minFiatAmount = snapshot.minFiatAmount
    ad.maxFiatAmount = snapshot.maxFiatAmount
    ad.lastSyncedAt = new Date()
  }

  private async validateLinked(manager: EntityManager, ad: MerchantAdEntity, rule: UnifiedAdRule) {
    const { tenantId, merchantId, id } = ad
    if (rule.linkedAdId) {
      if (rule.linkedAdId === id) throw new BadRequestException('副广告不能选择自己')
      if (
        rule.linkedDiscount === null ||
        rule.linkedDiscount === undefined ||
        new Big(rule.linkedDiscount).lt(0) ||
        new Big(rule.linkedDiscount).gte(1)
      )
        throw new BadRequestException('副广告折扣系数必须大于等于 0 且小于 1')
      const linked = await this.requireAd(manager, tenantId, merchantId, rule.linkedAdId)
      if (linked.fiatCurrency !== ad.fiatCurrency)
        throw new BadRequestException('主副广告必须使用同一种法币')
      if (linked.enabled || linked.pendingRunId || linked.rule?.linkedAdId)
        throw new ConflictException('副广告不能开启独立自动调价、存在在途调价或再关联副广告')
      const parents = await manager.find(MerchantAdEntity, { where: { tenantId, merchantId } })
      if (parents.some((parent) => parent.id !== id && parent.rule?.linkedAdId === linked.id))
        throw new ConflictException('该副广告已被其他主广告关联')
    }
  }

  private async adViews(items: MerchantAdEntity[]) {
    if (!items.length) return []
    const tenantId = items[0].tenantId
    const merchantIds = [...new Set(items.map((ad) => ad.merchantId))]
    const ids = [
      ...new Set(
        items.flatMap((ad) => [ad.id, ...(ad.rule?.linkedAdId ? [ad.rule.linkedAdId] : [])]),
      ),
    ]
    const [merchants, related] = await Promise.all([
      this.merchantMap(tenantId, merchantIds),
      this.ads
        .createQueryBuilder('ad')
        .where('ad.tenantId = :tenantId', { tenantId })
        .andWhere('ad.merchantId IN (:...merchantIds)', { merchantIds })
        .andWhere("(ad.id IN (:...ids) OR ad.rule ->> 'linkedAdId' IN (:...ids))", { ids })
        .getMany(),
    ])
    const byId = new Map(related.map((ad) => [ad.id, ad]))
    const parents = new Map(
      related
        .filter((ad) => ad.rule?.linkedAdId)
        .map((ad) => [`${ad.merchantId}:${ad.rule!.linkedAdId}`, ad]),
    )
    return items.map((ad) => ({
      ...ad,
      merchantName: merchants.get(ad.merchantId)!.name,
      pricing: this.pricingRelation(ad, byId, parents),
    }))
  }

  private pricingRelation(
    ad: MerchantAdEntity,
    byId: Map<string, MerchantAdEntity>,
    parents: Map<string, MerchantAdEntity>,
  ): AdPricingRelation {
    const summary = (target: MerchantAdEntity) => ({
      id: target.id,
      platformAdId: target.platformAdId,
      status: target.status,
      enabled: target.enabled,
    })
    const parent = parents.get(`${ad.merchantId}:${ad.id}`)
    if (parent)
      return { role: 'LINKED', mainAd: summary(parent), discount: parent.rule!.linkedDiscount! }
    if (ad.rule?.linkedAdId)
      return {
        role: 'MAIN',
        linkedAd: summary(byId.get(ad.rule.linkedAdId)!),
        discount: ad.rule.linkedDiscount!,
      }
    return { role: 'INDEPENDENT' }
  }

  private async runViews(items: MerchantAdRunEntity[]) {
    if (!items.length) return []
    const merchants = await this.merchantMap(
      items[0].tenantId,
      items.map((run) => run.merchantId),
    )
    const linkedIds = items.flatMap((run) =>
      run.evidence?.linkedAd?.runId ? [run.evidence.linkedAd.runId] : [],
    )
    const linkedRuns = linkedIds.length
      ? await this.runs.find({
          where: {
            tenantId: items[0].tenantId,
            merchantId: In([...new Set(items.map((run) => run.merchantId))]),
            id: In(linkedIds),
          },
        })
      : []
    const linkedMap = new Map(linkedRuns.map((run) => [run.id, run]))
    return items.map((run) => {
      const merchant = merchants.get(run.merchantId)!
      const linked = linkedMap.get(run.evidence?.linkedAd?.runId ?? '')
      return {
        ...run,
        merchantName: merchant.name,
        platform: merchant.platform,
        linkedRun:
          linked && linked.merchantId === run.merchantId
            ? {
                id: linked.id,
                status: linked.status,
                reason: linked.reason,
                actualPrice: linked.actualPrice,
              }
            : null,
      }
    })
  }

  private async merchantMap(tenantId: string, ids: string[]) {
    const merchants = await this.merchants.find({
      select: { id: true, name: true, platform: true },
      where: { tenantId, id: In([...new Set(ids)]) },
    })
    return new Map(merchants.map((merchant) => [merchant.id, merchant]))
  }
}
