import { PaymentBatchStatus, PaymentSourceType, PlatformConfirmationStatus } from '@admin/database'
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common'
import type { AlipayBatchResponse } from './alipay-batch.adapter'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import type { ExecutablePaymentOrder } from './payment-execution-coordinator'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentNotSubmittedError } from './payment-execution.errors'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'
import type { PaymentReconciliationPolicy } from './payment-adapter.types'

export interface ExecutablePaymentBatchItem {
  id: string
  paymentOrderId: string
  paymentNo: string
  sourceType: PaymentSourceType
  amount: string
  payeeIdentity: string
  payeeName: string
}

export interface ExecutablePaymentBatch {
  id: string
  tenantId: string
  merchantId?: string
  batchNo: string
  status: PaymentBatchStatus
  credentialRef: string
  upstreamId?: string | null
  reconciliationAttempts: number
  nextReconcileAt: Date | null
  items: ExecutablePaymentBatchItem[]
}

export interface PaymentBatchReconciliationSchedule {
  reconciliationAttempts: number
  nextReconcileAt: Date | null
}

export interface PaymentBatchApplyOutcome {
  batch: ExecutablePaymentBatch
  paymentsToConfirm: ExecutablePaymentOrder[]
}

export interface PaymentBatchStore {
  prepare: (tenantId: string, batchId: string) => Promise<ExecutablePaymentBatch>
  claim: (batch: ExecutablePaymentBatch) => Promise<ExecutablePaymentBatch>
  markSubmitted: (
    batch: ExecutablePaymentBatch,
    status: PaymentBatchStatus.PROCESSING,
    upstreamId?: string,
    schedule?: PaymentBatchReconciliationSchedule,
  ) => Promise<ExecutablePaymentBatch>
  markUnknown: (
    batch: ExecutablePaymentBatch,
    errorMessage?: string,
    schedule?: PaymentBatchReconciliationSchedule,
  ) => Promise<ExecutablePaymentBatch>
  fail: (batch: ExecutablePaymentBatch, errorMessage?: string) => Promise<ExecutablePaymentBatch>
  applyQuery: (
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
    schedule?: PaymentBatchReconciliationSchedule,
  ) => Promise<PaymentBatchApplyOutcome>
  prepareForQuery?: (tenantId: string, batchId: string) => Promise<ExecutablePaymentBatch>
}

export interface PaymentBatchExecutor {
  submit: (batch: ExecutablePaymentBatch) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  query: (batch: ExecutablePaymentBatch) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  getReconciliationPolicy: (batch: ExecutablePaymentBatch) => PaymentReconciliationPolicy
}

export interface PaymentBatchPreflightVerifier {
  verifyBatch: (tenantId: string, paymentOrderId: string) => Promise<unknown>
}

export const PAYMENT_BATCH_STORE = Symbol('PAYMENT_BATCH_STORE')
export const PAYMENT_BATCH_EXECUTOR = Symbol('PAYMENT_BATCH_EXECUTOR')
export const PAYMENT_BATCH_PREFLIGHT = Symbol('PAYMENT_BATCH_PREFLIGHT')

@Injectable()
export class PaymentBatchExecutionCoordinator {
  constructor(
    @Inject(PAYMENT_BATCH_STORE) private readonly store: PaymentBatchStore,
    @Inject(PAYMENT_BATCH_EXECUTOR) private readonly executor: PaymentBatchExecutor,
    @Inject(PAYMENT_BATCH_PREFLIGHT) private readonly preflight: PaymentBatchPreflightVerifier,
    @Inject(PaymentExecutionCoordinator)
    private readonly payments: Pick<PaymentExecutionCoordinator, 'confirmPlatform'>,
    @Optional() private readonly eventEmitter?: EventEmitterService,
  ) {}

  async submit(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
    const prepared = await this.store.prepare(tenantId, batchId)
    if (prepared.status !== PaymentBatchStatus.READY)
      throw new ConflictException('只有待提交支付批次可以提交')
    const policy = this.executor.getReconciliationPolicy(prepared)
    for (const item of prepared.items) {
      if (item.sourceType === PaymentSourceType.C2C_BUY) {
        await this.preflight.verifyBatch(tenantId, item.paymentOrderId)
      }
    }
    const claimed = await this.store.claim(prepared)
    this.emitStatus(claimed)
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.submit(claimed)
    } catch (error) {
      const outcome =
        error instanceof PaymentNotSubmittedError
          ? await this.store.fail(claimed, this.errorMessage(error))
          : await this.store.markUnknown(
              claimed,
              this.errorMessage(error),
              this.initialSchedule(policy),
            )
      this.emitStatus(outcome, this.errorMessage(error))
      return outcome
    }
    if (result.status === PaymentExecutionStatus.FAILED) {
      const outcome = await this.store.fail(claimed, result.errorMessage)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      const outcome = await this.store.markUnknown(
        claimed,
        result.errorMessage,
        this.initialSchedule(policy),
      )
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    const submitted = await this.store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      result.upstreamId,
      this.initialSchedule(policy),
    )
    this.emitStatus(submitted)
    return submitted
  }

  async reconcile(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
    const batch = await this.store.prepare(tenantId, batchId)
    if (
      ![
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ].includes(batch.status)
    )
      throw new ConflictException('只有提交中、处理中或结果未知的支付批次可以回查')
    return this.queryAndApply(batch)
  }

  async queryUpstream(tenantId: string, batchId: string) {
    const batch = this.store.prepareForQuery
      ? await this.store.prepareForQuery(tenantId, batchId)
      : await this.store.prepare(tenantId, batchId)
    const schedule = this.nextSchedule(batch, this.executor.getReconciliationPolicy(batch))
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.query(batch)
    } catch (error) {
      let current = batch
      if (
        [
          PaymentBatchStatus.SUBMITTING,
          PaymentBatchStatus.PROCESSING,
          PaymentBatchStatus.UNKNOWN,
        ].includes(batch.status)
      ) {
        current = await this.store.markUnknown(batch, this.errorMessage(error), schedule)
        this.emitStatus(current, this.errorMessage(error))
      }
      return {
        batch: current,
        upstream: {
          status: PaymentExecutionStatus.UNKNOWN,
          errorMessage: this.errorMessage(error),
          raw: null,
        },
      }
    }
    let current = batch
    if (
      [
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ].includes(batch.status)
    ) {
      if (result.status === PaymentExecutionStatus.UNKNOWN) {
        current = await this.store.markUnknown(batch, result.errorMessage, schedule)
        this.emitStatus(current, result.errorMessage)
      } else {
        const outcome = await this.applyQueryResultAndConfirm(batch, result, schedule)
        current = outcome
      }
    }
    return {
      batch: current,
      upstream: {
        status: result.status,
        upstreamId: result.upstreamId,
        errorMessage: result.errorMessage,
        raw: result.raw,
      },
    }
  }

  private async queryAndApply(batch: ExecutablePaymentBatch): Promise<ExecutablePaymentBatch> {
    const schedule = this.nextSchedule(batch, this.executor.getReconciliationPolicy(batch))
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.query(batch)
    } catch (error) {
      const outcome = await this.store.markUnknown(batch, this.errorMessage(error), schedule)
      this.emitStatus(outcome, this.errorMessage(error))
      return outcome
    }
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      const outcome = await this.store.markUnknown(batch, result.errorMessage, schedule)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    return this.applyQueryResultAndConfirm(batch, result, schedule)
  }

  private async applyQueryResultAndConfirm(
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
    schedule: PaymentBatchReconciliationSchedule,
  ): Promise<ExecutablePaymentBatch> {
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      const outcome = await this.store.markUnknown(batch, result.errorMessage, schedule)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    let outcome: PaymentBatchApplyOutcome
    try {
      outcome = await this.applyQueryResult(batch, result, schedule)
    } catch (error) {
      const unknown = await this.store.markUnknown(batch, this.errorMessage(error), schedule)
      this.emitStatus(unknown, this.errorMessage(error))
      return unknown
    }
    const confirmationResults: ExecutablePaymentOrder[] = []
    for (const payment of outcome.paymentsToConfirm) {
      confirmationResults.push(
        await this.payments.confirmPlatform(payment, { suppressFailureNotification: true }),
      )
    }
    if (confirmationResults.length && batch.merchantId) {
      this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_BATCH_PLATFORM_CONFIRMATION_RESULT, {
        tenantId: batch.tenantId,
        merchantId: batch.merchantId,
        batchId: batch.id,
        batchNo: batch.batchNo,
        items: confirmationResults.map((payment) => ({
          paymentOrderId: payment.id,
          sourceBusinessNo: payment.sourceBusinessNo ?? payment.id,
          amount: payment.amount ?? '0.00',
          currency: payment.currency ?? 'CNY',
          success: payment.platformConfirmStatus === PlatformConfirmationStatus.SUCCESS,
          errorMessage: payment.platformConfirmLastError ?? null,
        })),
      })
    }
    this.emitStatus(outcome.batch)
    return outcome.batch
  }

  private async applyQueryResult(
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
    schedule: PaymentBatchReconciliationSchedule,
  ): Promise<PaymentBatchApplyOutcome> {
    return this.store.applyQuery(batch, result, schedule)
  }

  private initialSchedule(policy: PaymentReconciliationPolicy): PaymentBatchReconciliationSchedule {
    return {
      reconciliationAttempts: 0,
      nextReconcileAt:
        policy.enabled && policy.maxAttempts > 0
          ? new Date(Date.now() + Math.max(0, policy.initialDelaySeconds) * 1000)
          : null,
    }
  }

  private nextSchedule(
    batch: ExecutablePaymentBatch,
    policy: PaymentReconciliationPolicy,
  ): PaymentBatchReconciliationSchedule {
    const reconciliationAttempts = batch.reconciliationAttempts + 1
    return {
      reconciliationAttempts,
      nextReconcileAt:
        policy.enabled && reconciliationAttempts < policy.maxAttempts
          ? new Date(Date.now() + Math.max(0, policy.intervalSeconds) * 1000)
          : null,
    }
  }

  private emitStatus(batch: ExecutablePaymentBatch, errorMessage?: string): void {
    if (!batch.merchantId) return
    this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_BATCH_STATUS, {
      tenantId: batch.tenantId,
      merchantId: batch.merchantId,
      batchId: batch.id,
      batchNo: batch.batchNo,
      status: batch.status,
      errorMessage: errorMessage ?? null,
    })
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
