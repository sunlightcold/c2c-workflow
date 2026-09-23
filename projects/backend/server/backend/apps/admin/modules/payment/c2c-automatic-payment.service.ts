import {
  PaymentExecutionMode,
  PaymentOrderStatus,
  PlatformConfirmationStatus,
} from '@admin/database'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { C2cMerchantPaymentService } from './c2c-merchant-payment.service'
import type {
  AutomaticPaymentCandidate,
  C2cAutomaticPaymentStore,
} from './c2c-automatic-payment.types'
import { PaymentBatchExecutionCoordinator } from './payment-batch-execution-coordinator'
import { PaymentBatchService } from './payment-batch.service'
import { PaymentBatchPolicyService } from './payment-batch-policy.service'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentOrderService } from './payment-order.service'
import { sumCnyAmounts } from './payment-adapter.types'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'

export const C2C_AUTOMATIC_PAYMENT_STORE = Symbol('C2C_AUTOMATIC_PAYMENT_STORE')
const AUTOMATION_LIMIT = 100
const AUTOMATION_CONCURRENCY = 8

class PaymentOrderCreationError extends Error {
  readonly notificationCode = 'C2C_PAYMENT_ORDER_NOT_CREATED'

  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = 'PaymentOrderCreationError'
  }
}

@Injectable()
export class C2cAutomaticPaymentService {
  private readonly logger = new Logger(C2cAutomaticPaymentService.name)

  constructor(
    @Inject(C2C_AUTOMATIC_PAYMENT_STORE) private readonly store: C2cAutomaticPaymentStore,
    private readonly merchantPayments: C2cMerchantPaymentService,
    private readonly paymentOrders: PaymentOrderService,
    private readonly payments: PaymentExecutionCoordinator,
    private readonly batches: PaymentBatchService,
    private readonly batchPolicies: PaymentBatchPolicyService,
    private readonly batchExecution: PaymentBatchExecutionCoordinator,
    @Optional() private readonly eventEmitter?: EventEmitterService,
  ) {}

  async createAndSubmit(now = new Date()) {
    const candidates = await this.store.findCandidates(now, AUTOMATION_LIMIT)
    return this.runItems(candidates, (candidate) =>
      this.store.runLocked(`automatic-payment:${candidate.merchantOrderId}`, () =>
        this.processCandidate(candidate),
      ),
    )
  }

  async submitReadyBatches(now = new Date()) {
    const scopes = await this.store.findBatchScopes(AUTOMATION_LIMIT)
    const groups = (
      await Promise.all(
        scopes.map((scope) => this.batches.findReadyGroups(scope.tenantId, scope.merchantId)),
      )
    ).flatMap((readyGroups, index) => readyGroups.map((group) => ({ ...scopes[index], ...group })))
    const eligible: Array<(typeof groups)[number] & { ruleIds: string[] }> = []
    for (const group of groups) {
      const rules = await this.batchPolicies.findActiveRules(
        group.tenantId,
        group.merchantId,
        group.batchPolicyId,
      )
      const ruleIds = this.batchPolicies.evaluateRules(rules, {
        now,
        oldestReadyAt: group.oldestReadyAt,
        readyCount: group.paymentOrderIds.length,
      })
      if (ruleIds.length) eligible.push({ ...group, ruleIds })
    }
    const summaries = new Map<
      string,
      {
        tenantId: string
        merchantId: string
        totalCount: number
        amounts: string[]
        groups: number
        submitted: number
        failed: number
        errors: string[]
        batchIds: string[]
      }
    >()
    const result = await this.runItems(eligible, async (group) => {
      const key = `${group.tenantId}:${group.merchantId}`
      const summary = summaries.get(key) ?? {
        tenantId: group.tenantId,
        merchantId: group.merchantId,
        totalCount: 0,
        amounts: [],
        groups: 0,
        submitted: 0,
        failed: 0,
        errors: [],
        batchIds: [],
      }
      summary.totalCount += group.paymentOrderIds.length
      summary.amounts.push(group.totalAmount)
      summary.groups += 1
      summaries.set(key, summary)
      try {
        const submitted = await this.store.runLocked(this.batchLockKey(group), async () => {
          const created = await this.batches.create(group.tenantId, group.paymentOrderIds, {
            ruleIds: group.ruleIds,
            source: 'AUTOMATIC',
          })
          return this.batchExecution.submit(group.tenantId, created.batch.id)
        })
        if (submitted === undefined) {
          summary.totalCount -= group.paymentOrderIds.length
          summary.amounts.pop()
          summary.groups -= 1
        } else if (submitted.status === 'PROCESSING') {
          summary.submitted += 1
          summary.batchIds.push(submitted.id)
        } else {
          summary.failed += 1
          summary.batchIds.push(submitted.id)
        }
        return submitted
      } catch (error) {
        summary.failed += 1
        summary.errors.push(this.errorMessage(error))
        throw error
      }
    })
    for (const summary of summaries.values()) {
      if (!summary.groups) continue
      await this.eventEmitter?.emitAsync(EVENT_KEYS.TELEGRAM_BATCH_SUBMITTED, {
        tenantId: summary.tenantId,
        merchantId: summary.merchantId,
        totalCount: summary.totalCount,
        totalAmount: sumCnyAmounts(summary.amounts),
        groups: summary.groups,
        submitted: summary.submitted,
        failed: summary.failed,
        ...(summary.errors.length ? { errors: summary.errors } : {}),
        batchIds: summary.batchIds,
      })
    }
    return result
  }

  async submitPolicyManually(tenantId: string, policyId: string, merchantId: string | null) {
    await this.batchPolicies.requireManualRule(tenantId, merchantId, policyId)
    const groups = await this.batches.findReadyGroups(tenantId, merchantId, policyId)
    return this.runItems(groups, (group) =>
      this.store.runLocked(this.batchLockKey({ ...group, tenantId }), async () => {
        const created = await this.batches.create(tenantId, group.paymentOrderIds, {
          ruleIds: [],
          source: 'MANUAL',
        })
        return this.batchExecution.submit(tenantId, created.batch.id)
      }),
    )
  }

  async recover() {
    const [payments, batches] = await Promise.all([
      this.store.findRecoverablePayments(AUTOMATION_LIMIT),
      this.store.findRecoverableBatches(AUTOMATION_LIMIT),
    ])
    const paymentResult = await this.runItems(payments, (payment) =>
      this.store.runLocked(`payment-recovery:${payment.id}`, () =>
        payment.status === PaymentOrderStatus.SUCCESS &&
        [PlatformConfirmationStatus.PENDING, PlatformConfirmationStatus.PROCESSING].includes(
          payment.platformConfirmStatus,
        )
          ? this.payments.confirmPlatform(payment, {
              recoverProcessing:
                payment.platformConfirmStatus === PlatformConfirmationStatus.PROCESSING,
            })
          : this.payments.reconcile(payment.tenantId, payment.id),
      ),
    )
    const batchResult = await this.runItems(batches, (batch) =>
      this.store.runLocked(`batch-recovery:${batch.id}`, () =>
        this.batchExecution.reconcile(batch.tenantId, batch.id, {
          respectSchedule: true,
          skipIfBusy: true,
        }),
      ),
    )
    return { payments: paymentResult, batches: batchResult }
  }

  private async processCandidate(candidate: AutomaticPaymentCandidate) {
    if (!candidate.paymentOrderId) {
      let payment
      try {
        payment = await this.merchantPayments.create(
          candidate.tenantId,
          candidate.merchantId,
          candidate.merchantOrderId,
          true,
        )
      } catch (error) {
        throw new PaymentOrderCreationError(error)
      }
      await this.eventEmitter?.emitAsync(EVENT_KEYS.TELEGRAM_PAYMENT_CREATED, {
        tenantId: candidate.tenantId,
        merchantId: candidate.merchantId,
        merchantOrderId: candidate.merchantOrderId,
        paymentOrderId: payment.id,
        paymentNo: payment.paymentNo,
        sourceBusinessNo: payment.sourceBusinessNo,
        amount: payment.amount ?? null,
        currency: payment.currency ?? null,
        paymentMethod: payment.paymentMethod ?? null,
        payeeName: payment.payeeName ?? null,
        payeeIdentity: payment.payeeIdentity ?? null,
        identityMatched: true,
        status: payment.status,
        upstreamId: payment.upstreamId ?? null,
        errorMessage: payment.lastError ?? null,
      })
      return payment
    }
    let payment = {
      id: candidate.paymentOrderId,
      status: candidate.paymentOrderStatus!,
      executionMode: candidate.paymentOrderExecutionMode!,
    }
    if (payment.status === PaymentOrderStatus.PENDING_CONFIG) {
      payment = await this.paymentOrders.rematch(candidate.tenantId, payment.id, true)
      if (payment.status === PaymentOrderStatus.PENDING_CONFIG) {
        throw new PaymentOrderCreationError('没有可用的自动支付方案')
      }
    }
    if (
      payment.status === PaymentOrderStatus.READY &&
      payment.executionMode === PaymentExecutionMode.INSTANT
    ) {
      return this.payments.submit(candidate.tenantId, payment.id)
    }
    return payment
  }

  private async runItems<T>(items: T[], work: (item: T) => Promise<unknown>) {
    let succeeded = 0
    let failed = 0
    let cursor = 0
    const worker = async () => {
      while (true) {
        const index = cursor++
        if (index >= items.length) return
        const item = items[index]
        try {
          await work(item)
          succeeded += 1
        } catch (error) {
          failed += 1
          const message = this.errorMessage(error)
          const scoped = item as Partial<{
            tenantId: string
            merchantId: string
            id: string
            merchantOrderId: string
            sourceBusinessNo: string
            paymentOrderId: string
            batchNo: string
            paymentOrderIds: string[]
          }>
          this.logger.error(
            [
              '自动支付任务处理失败:',
              `tenantId=${this.logValue(scoped.tenantId, 'unknown')}`,
              `merchantId=${this.logValue(scoped.merchantId, 'unknown')}`,
              `merchantOrderId=${this.logValue(scoped.merchantOrderId, 'none')}`,
              `paymentOrderId=${this.logValue(scoped.paymentOrderId, this.logValue(scoped.id, 'none'))}`,
              `batchNo=${this.logValue(scoped.batchNo, 'none')}`,
              `paymentOrderIds=${this.logValue(scoped.paymentOrderIds?.join('|'), 'none')}`,
              `error=${message}`,
            ].join(' '),
          )
          const referenceId =
            scoped.sourceBusinessNo ??
            scoped.merchantOrderId ??
            scoped.batchNo ??
            scoped.id ??
            scoped.paymentOrderIds?.[0]
          if (this.eventEmitter && scoped.tenantId && scoped.merchantId && referenceId) {
            const notificationCode =
              error instanceof PaymentOrderCreationError
                ? error.notificationCode
                : 'AUTOMATIC_PAYMENT_FAILED'
            const claimed = await this.store.claimFailureNotification({
              tenantId: scoped.tenantId,
              code: notificationCode,
              merchantId: scoped.merchantId,
              message,
              referenceId,
            })
            if (claimed) {
              await this.eventEmitter.emitAsync(EVENT_KEYS.TELEGRAM_EXCEPTION, {
                tenantId: scoped.tenantId,
                merchantId: scoped.merchantId,
                code: notificationCode,
                message,
                referenceId,
              })
            }
          }
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(AUTOMATION_CONCURRENCY, items.length) }, () => worker()),
    )
    return { found: items.length, succeeded, failed }
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }

  private logValue(value: unknown, fallback: string): string {
    return value === undefined || value === null || value === '' ? fallback : String(value)
  }

  private batchLockKey(group: {
    batchPolicyId: string
    currency: string
    merchantId: string
    paymentAccountChannelId: string
    paymentAccountId: string
    tenantId: string
  }) {
    return [
      'automatic-batch',
      group.tenantId,
      group.merchantId,
      group.batchPolicyId,
      group.paymentAccountId,
      group.paymentAccountChannelId,
      group.currency,
    ].join(':')
  }
}
