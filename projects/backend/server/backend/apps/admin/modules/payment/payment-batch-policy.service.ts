import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'
import {
  BusinessStatus,
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentBatchEntity,
  PaymentBatchPolicyEntity,
  PaymentBatchPolicyRuleEntity,
  PaymentBatchPolicyScope,
  PaymentBatchRuleType,
  PaymentOrderEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, IsNull, Repository } from 'typeorm'
import type {
  PaymentBatchPolicyListDto,
  PaymentBatchPolicyRuleDto,
} from './payment-batch-policy.dto'

export interface BatchRuleEvaluationInput {
  now: Date
  oldestReadyAt: Date
  readyCount: number
}

export interface EvaluatedBatchRule {
  id: string
  ruleType: PaymentBatchRuleType
  intervalSeconds: number | null
  orderCount: number | null
}

@Injectable()
export class PaymentBatchPolicyService {
  constructor(
    @InjectRepository(PaymentBatchPolicyEntity)
    private readonly policies: Repository<PaymentBatchPolicyEntity>,
    @InjectRepository(PaymentBatchPolicyRuleEntity)
    private readonly rules: Repository<PaymentBatchPolicyRuleEntity>,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, input: PaymentBatchPolicyListDto) {
    if (input.applicableMerchantId && (input.merchantId || input.scopeType)) {
      throw new BadRequestException('适用商家筛选不能与策略范围或指定商家筛选同时使用')
    }
    if (input.scopeType === PaymentBatchPolicyScope.GLOBAL && input.merchantId) {
      throw new BadRequestException('全局策略不能指定商家')
    }
    const commonWhere = {
      tenantId,
      ...(input.status ? { status: input.status } : {}),
    }
    const where = input.applicableMerchantId
      ? [
          { ...commonWhere, merchantId: IsNull(), scopeType: PaymentBatchPolicyScope.GLOBAL },
          {
            ...commonWhere,
            merchantId: input.applicableMerchantId,
            scopeType: PaymentBatchPolicyScope.MERCHANT,
          },
        ]
      : {
          ...commonWhere,
          ...(input.scopeType ? { scopeType: input.scopeType } : {}),
          ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        }
    const [policies, total] = await this.policies.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    const policyRules = policies.length
      ? await this.rules
          .createQueryBuilder('rule')
          .where('rule."tenantId" = :tenantId', { tenantId })
          .andWhere('rule."policyId" IN (:...policyIds)', {
            policyIds: policies.map(({ id }) => id),
          })
          .orderBy('rule."createdAt"', 'ASC')
          .getMany()
      : []
    return {
      items: policies.map((policy) => ({
        ...policy,
        rules: policyRules.filter(({ policyId }) => policyId === policy.id),
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async detail(tenantId: string, id: string) {
    const policy = await this.policies.findOne({ where: { id, tenantId } })
    if (!policy) throw new NotFoundException('支付批次策略不存在')
    const rules = await this.rules.find({
      where: { tenantId, policyId: policy.id },
      order: { createdAt: 'ASC' },
    })
    return { ...policy, rules }
  }

  async findActiveRules(tenantId: string, merchantId: string | null, policyId: string) {
    const policy = await this.policies.findOne({
      where: { id: policyId, tenantId, status: BusinessStatus.ACTIVE },
    })
    if (
      !policy ||
      (policy.scopeType === PaymentBatchPolicyScope.MERCHANT && policy.merchantId !== merchantId)
    ) {
      return []
    }
    return this.rules.find({
      where: {
        tenantId,
        policyId,
        status: BusinessStatus.ACTIVE,
      },
      order: { createdAt: 'ASC' },
    })
  }

  async requireManualRule(tenantId: string, merchantId: string | null, policyId: string) {
    const rules = await this.findActiveRules(tenantId, merchantId, policyId)
    if (!rules.some(({ ruleType }) => ruleType === PaymentBatchRuleType.MANUAL)) {
      throw new ConflictException('该批次策略未启用手动提交规则')
    }
  }

  async create(
    tenantId: string,
    input: {
      merchantId?: string
      name: string
      rules: PaymentBatchPolicyRuleDto[]
      scopeType: PaymentBatchPolicyScope
    },
  ) {
    const merchantId = await this.resolveMerchantScope(tenantId, input.scopeType, input.merchantId)
    this.validateRules(input.rules)
    return this.dataSource.transaction(async (manager) => {
      const policy = await manager.save(
        PaymentBatchPolicyEntity,
        manager.create(PaymentBatchPolicyEntity, {
          tenantId,
          merchantId,
          scopeType: input.scopeType,
          code: IdUtils.generateBusinessNo(BusinessNoPrefix.PAYMENT_BATCH_POLICY),
          name: input.name.trim(),
          status: BusinessStatus.ACTIVE,
        }),
      )
      const rules = await manager.save(
        PaymentBatchPolicyRuleEntity,
        input.rules.map((rule) => this.createRule(manager, policy, rule)),
      )
      return { ...policy, rules }
    })
  }

  async update(
    tenantId: string,
    id: string,
    input: { name: string; rules: PaymentBatchPolicyRuleDto[] },
  ) {
    this.validateRules(input.rules)
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(PaymentBatchPolicyEntity)
      const policy = await repository.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!policy) throw new NotFoundException('支付批次策略不存在')
      policy.name = input.name.trim()
      await repository.save(policy)
      const ruleRepository = manager.getRepository(PaymentBatchPolicyRuleEntity)
      await ruleRepository.delete({ tenantId, policyId: policy.id })
      const rules = await ruleRepository.save(
        input.rules.map((rule) => this.createRule(manager, policy, rule)),
      )
      return { ...policy, rules }
    })
  }

  async setStatus(tenantId: string, id: string, status: BusinessStatus) {
    const policy = await this.policies.findOne({ where: { id, tenantId } })
    if (!policy) throw new NotFoundException('支付批次策略不存在')
    if (status === BusinessStatus.ACTIVE) {
      const activeRule = await this.rules.exists({
        where: {
          tenantId,
          policyId: id,
          status: BusinessStatus.ACTIVE,
        },
      })
      if (!activeRule) throw new BadRequestException('支付批次策略至少需要一条启用规则')
    }
    policy.status = status
    return this.policies.save(policy)
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const policyRepository = manager.getRepository(PaymentBatchPolicyEntity)
      const policy = await policyRepository.findOne({
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!policy) throw new NotFoundException('支付批次策略不存在')
      const referenced = await Promise.all([
        manager
          .getRepository(MerchantPaymentPlanEntity)
          .exists({ where: { tenantId, batchPolicyId: id } }),
        manager
          .getRepository(PaymentOrderEntity)
          .exists({ where: { tenantId, batchPolicyId: id } }),
        manager
          .getRepository(PaymentBatchEntity)
          .exists({ where: { tenantId, batchPolicyId: id } }),
      ])
      if (referenced.some(Boolean)) {
        throw new ConflictException('支付批次策略已被支付方案或订单使用，不能删除，可停用该策略')
      }
      await policyRepository.delete({ id, tenantId })
    })
  }

  evaluateRules(rules: EvaluatedBatchRule[], input: BatchRuleEvaluationInput): string[] {
    return rules
      .filter((rule) => {
        if (rule.ruleType === PaymentBatchRuleType.INTERVAL) {
          return (
            rule.intervalSeconds !== null &&
            input.now.getTime() - input.oldestReadyAt.getTime() >= rule.intervalSeconds * 1000
          )
        }
        if (rule.ruleType === PaymentBatchRuleType.ORDER_COUNT) {
          return rule.orderCount !== null && input.readyCount >= rule.orderCount
        }
        return false
      })
      .map(({ id }) => id)
  }

  private async requireMerchant(tenantId: string, merchantId: string) {
    const merchant = await this.merchants.findOne({
      where: { id: merchantId, tenantId, status: BusinessStatus.ACTIVE },
    })
    if (!merchant) throw new BadRequestException('商家不可用或不属于当前所属单位')
  }

  private async resolveMerchantScope(
    tenantId: string,
    scopeType: PaymentBatchPolicyScope,
    merchantId?: string,
  ): Promise<string | null> {
    if (scopeType === PaymentBatchPolicyScope.GLOBAL) {
      if (merchantId) throw new BadRequestException('全局策略不能指定商家')
      return null
    }
    if (!merchantId) throw new BadRequestException('商家策略必须选择商家账号')
    await this.requireMerchant(tenantId, merchantId)
    return merchantId
  }

  private validateRules(rules: PaymentBatchPolicyRuleDto[]) {
    if (!rules.some(({ status }) => status === BusinessStatus.ACTIVE)) {
      throw new BadRequestException('支付批次策略至少需要一条启用规则')
    }
    for (const rule of rules) {
      const hasInterval = rule.intervalSeconds !== undefined
      const hasCount = rule.orderCount !== undefined
      if (rule.ruleType === PaymentBatchRuleType.MANUAL && (hasInterval || hasCount)) {
        throw new BadRequestException('手动提交规则不能配置时间或订单数')
      }
      if (rule.ruleType === PaymentBatchRuleType.INTERVAL && (!hasInterval || hasCount)) {
        throw new BadRequestException('时间间隔规则必须且只能配置间隔秒数')
      }
      if (rule.ruleType === PaymentBatchRuleType.ORDER_COUNT && (!hasCount || hasInterval)) {
        throw new BadRequestException('订单数量规则必须且只能配置订单数量')
      }
    }
  }

  private createRule(
    manager: DataSource['manager'],
    policy: PaymentBatchPolicyEntity,
    rule: PaymentBatchPolicyRuleDto,
  ) {
    return manager.create(PaymentBatchPolicyRuleEntity, {
      tenantId: policy.tenantId,
      policyId: policy.id,
      ruleType: rule.ruleType,
      intervalSeconds: rule.intervalSeconds ?? null,
      orderCount: rule.orderCount ?? null,
      status: rule.status,
    })
  }
}
