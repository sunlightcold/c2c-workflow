import { createHash } from 'node:crypto'
import { PaymentAdapterCode, PaymentExecutionMode } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

export interface ResolvePaymentPlanInput {
  automaticOnly?: boolean
  tenantId: string
  merchantId: string
  /** Legacy classification retained for audit; it does not affect route selection. */
  scene: string
  currency: string
  amount: string
  paymentMethod: string
  executionMode?: PaymentExecutionMode
  routingKey: string
}

export interface ResolvedPaymentPlan {
  batchPolicyId: string | null
  planId: string
  paymentAccountId: string
  paymentAccountChannelId: string
  adapterCode: PaymentAdapterCode
  executionMode: PaymentExecutionMode
}

export interface PaymentPlanResolverPort {
  resolve: (input: ResolvePaymentPlanInput) => Promise<ResolvedPaymentPlan | null>
}

export const PAYMENT_PLAN_RESOLVER = Symbol('PAYMENT_PLAN_RESOLVER')

interface PaymentPlanCandidate extends ResolvedPaymentPlan {
  priority: number
  weight: number
}

@Injectable()
export class PaymentPlanResolver implements PaymentPlanResolverPort {
  constructor(private readonly dataSource: DataSource) {}

  async resolve(input: ResolvePaymentPlanInput): Promise<ResolvedPaymentPlan | null> {
    if (!['BOT_MANUAL', 'C2C_BUY'].includes(input.scene)) return null
    const candidates = await this.findCandidates(input)
    if (!candidates.length) return null
    const priority = Number(candidates[0].priority)
    const group = candidates.filter((candidate) => Number(candidate.priority) === priority)
    const totalWeight = group.reduce((total, candidate) => total + Number(candidate.weight), 0)
    const digest = createHash('sha256').update(input.routingKey).digest()
    let point = Number(digest.readBigUInt64BE(0) % BigInt(totalWeight))
    const selected =
      group.find((candidate) => {
        point -= Number(candidate.weight)
        return point < 0
      }) ?? group[0]
    return {
      planId: selected.planId,
      batchPolicyId: selected.batchPolicyId,
      paymentAccountId: selected.paymentAccountId,
      paymentAccountChannelId: selected.paymentAccountChannelId,
      adapterCode: selected.adapterCode,
      executionMode: selected.executionMode,
    }
  }

  private async findCandidates(input: ResolvePaymentPlanInput) {
    const candidates = await this.dataSource.query<PaymentPlanCandidate[]>(
      `SELECT
         plan.id AS "planId",
         plan."paymentAccountId",
         plan."paymentAccountChannelId",
         plan."batchPolicyId",
         channel."adapterCode",
         channel."executionMode",
         plan.priority,
         plan.weight
       FROM merchant_payment_plan plan
       INNER JOIN merchant merchant
         ON merchant.id = plan."merchantId" AND merchant."tenantId" = plan."tenantId"
       INNER JOIN payment_account account
         ON account.id = plan."paymentAccountId" AND account."tenantId" = plan."tenantId"
       INNER JOIN payment_account_channel account_channel
         ON account_channel.id = plan."paymentAccountChannelId"
        AND account_channel."paymentAccountId" = account.id
       INNER JOIN payment_channel channel ON channel.id = account_channel."channelId"
       LEFT JOIN payment_batch_policy batch_policy
          ON batch_policy.id = plan."batchPolicyId"
         AND batch_policy."tenantId" = plan."tenantId"
         AND (batch_policy."merchantId" IS NULL OR batch_policy."merchantId" = plan."merchantId")
       INNER JOIN payment_platform platform
         ON platform.id = channel."platformId" AND platform.id = account."platformId"
       WHERE plan."tenantId" = $1
         AND plan."merchantId" = $2
         AND plan.scene IN ('BOT_MANUAL', 'C2C_BUY')
         AND plan.currency = $3
         AND plan.status = 'active'
         AND merchant.status = 'active'
         AND account.status = 'active'
         AND account_channel.status = 'active'
         AND channel.status = 'active'
         AND platform.status = 'active'
         AND (account_channel."minimumAmount" IS NULL OR account_channel."minimumAmount" <= $4::decimal)
         AND (account_channel."maximumAmount" IS NULL OR account_channel."maximumAmount" >= $4::decimal)
         AND platform.code = $5
         AND ($6::payment_execution_mode_enum IS NULL OR channel."executionMode" = $6)
         AND ($7::boolean = false OR plan."automaticPaymentEnabled" = true)
         AND (
           (channel."executionMode" = 'INSTANT' AND plan."batchPolicyId" IS NULL)
           OR (channel."executionMode" = 'BATCH' AND batch_policy.status = 'active')
         )
       ORDER BY plan.priority ASC, plan.id ASC`,
      [
        input.tenantId,
        input.merchantId,
        input.currency,
        input.amount,
        input.paymentMethod,
        input.executionMode ?? null,
        input.automaticOnly ?? false,
      ],
    )
    return candidates
  }
}
