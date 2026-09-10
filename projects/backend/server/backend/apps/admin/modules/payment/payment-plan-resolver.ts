import { createHash } from 'node:crypto'
import { PaymentAdapterCode, PaymentExecutionMode } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'

export interface ResolvePaymentPlanInput {
  tenantId: string
  merchantId: string
  scene: string
  currency: string
  amount: string
  paymentMethod: string
  executionMode: PaymentExecutionMode
  routingKey: string
}

export interface ResolvedPaymentPlan {
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
    const candidates = await this.dataSource.query<PaymentPlanCandidate[]>(
      `SELECT
         plan.id AS "planId",
         plan."paymentAccountId",
         plan."paymentAccountChannelId",
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
       INNER JOIN payment_platform platform
         ON platform.id = channel."platformId" AND platform.id = account."platformId"
       WHERE plan."tenantId" = $1
         AND plan."merchantId" = $2
         AND plan.scene = $3
         AND plan.currency = $4
         AND plan.status = 'active'
         AND merchant.status = 'active'
         AND account.status = 'active'
         AND account_channel.status = 'active'
         AND channel.status = 'active'
         AND platform.status = 'active'
         AND (account_channel."minimumAmount" IS NULL OR account_channel."minimumAmount" <= $5::decimal)
         AND (account_channel."maximumAmount" IS NULL OR account_channel."maximumAmount" >= $5::decimal)
         AND platform.code = $6
         AND channel."executionMode" = $7
       ORDER BY plan.priority ASC, plan.id ASC`,
      [
        input.tenantId,
        input.merchantId,
        input.scene,
        input.currency,
        input.amount,
        input.paymentMethod,
        input.executionMode,
      ],
    )
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
      paymentAccountId: selected.paymentAccountId,
      paymentAccountChannelId: selected.paymentAccountChannelId,
      adapterCode: selected.adapterCode,
      executionMode: selected.executionMode,
    }
  }
}
