import { PaymentBatchStatus, PaymentSourceType, PlatformConfirmationStatus } from '@admin/database'
import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
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
  sourceBusinessNo?: string
  upstreamId?: string | null
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
  recordReconciliationPending: (
    batch: ExecutablePaymentBatch,
    errorMessage: string | undefined,
    schedule: PaymentBatchReconciliationSchedule,
  ) => Promise<ExecutablePaymentBatch>
  fail: (batch: ExecutablePaymentBatch, errorMessage?: string) => Promise<ExecutablePaymentBatch>
  applyQuery: (
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
    schedule?: PaymentBatchReconciliationSchedule,
  ) => Promise<PaymentBatchApplyOutcome>
  prepareForQuery?: (tenantId: string, batchId: string) => Promise<ExecutablePaymentBatch>
  runLocked: <T>(key: string, work: () => Promise<T>) => Promise<T | undefined>
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
const PLATFORM_CONFIRM_CONCURRENCY = 8

@Injectable()
export class PaymentBatchExecutionCoordinator {
  private readonly logger = new Logger(PaymentBatchExecutionCoordinator.name)

  constructor(
    @Inject(PAYMENT_BATCH_STORE) private readonly store: PaymentBatchStore,
    @Inject(PAYMENT_BATCH_EXECUTOR) private readonly executor: PaymentBatchExecutor,
    @Inject(PAYMENT_BATCH_PREFLIGHT) private readonly preflight: PaymentBatchPreflightVerifier,
    @Inject(PaymentExecutionCoordinator)
    private readonly payments: Pick<PaymentExecutionCoordinator, 'confirmPlatform'>,
    @Optional() private readonly eventEmitter?: EventEmitterService,
  ) {}

  async submit(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
    const result = await this.store.runLocked(this.batchOperationLockKey(tenantId, batchId), () =>
      this.submitUnlocked(tenantId, batchId),
    )
    if (!result) throw new ConflictException('支付批次正在提交或回查，请稍后重试')
    return result
  }

  async reconcile(
    tenantId: string,
    batchId: string,
    options: { respectSchedule?: boolean; skipIfBusy?: boolean } = {},
  ): Promise<ExecutablePaymentBatch | undefined> {
    const result = await this.store.runLocked(this.batchOperationLockKey(tenantId, batchId), () =>
      this.reconcileUnlocked(tenantId, batchId, options.respectSchedule ?? false),
    )
    if (result) return result
    if (options.skipIfBusy) return undefined
    throw new ConflictException('支付批次正在提交或回查，请稍后重试')
  }

  async queryUpstream(tenantId: string, batchId: string) {
    const result = await this.store.runLocked(this.batchOperationLockKey(tenantId, batchId), () =>
      this.queryUpstreamUnlocked(tenantId, batchId),
    )
    if (!result) throw new ConflictException('支付批次正在提交或回查，请稍后重试')
    return result
  }

  private async submitUnlocked(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
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
    this.logger.log(`支付批次提交开始: ${this.batchLogContext(claimed, 'SUBMIT')}`)
    this.emitStatus(claimed)
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.submit(claimed)
    } catch (error) {
      const message = this.errorMessage(error)
      const outcome =
        error instanceof PaymentNotSubmittedError
          ? await this.store.fail(claimed, message)
          : await this.store.markUnknown(claimed, message, this.initialSchedule(policy))
      this.logger.error(
        `支付批次提交异常: ${this.batchLogContext(outcome, 'SUBMIT')}, error=${message}`,
      )
      this.emitStatus(outcome, message)
      return outcome
    }
    this.logger.log(
      `支付批次上游提交响应: ${this.batchLogContext(claimed, 'SUBMIT', result)}, upstreamStatus=${result.status}`,
    )
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
    this.logger.log(
      `支付批次提交完成: ${this.batchLogContext(submitted, 'SUBMIT', result)}, fromStatus=${claimed.status}, toStatus=${submitted.status}`,
    )
    this.emitStatus(submitted)
    return submitted
  }

  private async reconcileUnlocked(
    tenantId: string,
    batchId: string,
    respectSchedule: boolean,
  ): Promise<ExecutablePaymentBatch | undefined> {
    const batch = await this.store.prepare(tenantId, batchId)
    if (
      ![
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ].includes(batch.status)
    )
      throw new ConflictException('只有提交中、处理中或结果未知的支付批次可以回查')
    if (respectSchedule && !this.isReconciliationDue(batch)) return undefined
    this.logger.log(`支付批次自动回查开始: ${this.batchLogContext(batch, 'RECONCILE')}`)
    return this.queryAndApply(batch)
  }

  private async queryUpstreamUnlocked(tenantId: string, batchId: string) {
    const batch = this.store.prepareForQuery
      ? await this.store.prepareForQuery(tenantId, batchId)
      : await this.store.prepare(tenantId, batchId)
    const schedule = this.nextSchedule(batch, this.executor.getReconciliationPolicy(batch))
    this.logger.log(`支付批次人工查单开始: ${this.batchLogContext(batch, 'QUERY_UPSTREAM')}`)
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.query(batch)
    } catch (error) {
      const message = this.errorMessage(error)
      let current = batch
      if (
        [
          PaymentBatchStatus.SUBMITTING,
          PaymentBatchStatus.PROCESSING,
          PaymentBatchStatus.UNKNOWN,
        ].includes(batch.status)
      ) {
        current = await this.store.recordReconciliationPending(batch, message, schedule)
      }
      this.logger.error(
        `支付批次人工查单异常: ${this.batchLogContext(current, 'QUERY_UPSTREAM')}, error=${message}`,
      )
      return {
        batch: current,
        upstream: {
          status: PaymentExecutionStatus.UNKNOWN,
          errorMessage: message,
          raw: null,
        },
      }
    }
    this.logger.log(
      `支付批次人工查单响应: ${this.batchLogContext(batch, 'QUERY_UPSTREAM', result)}, upstreamStatus=${result.status}`,
    )
    let current = batch
    if (
      [
        PaymentBatchStatus.SUBMITTING,
        PaymentBatchStatus.PROCESSING,
        PaymentBatchStatus.UNKNOWN,
      ].includes(batch.status)
    ) {
      if (result.status === PaymentExecutionStatus.UNKNOWN) {
        current = await this.store.recordReconciliationPending(batch, result.errorMessage, schedule)
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
      const message = this.errorMessage(error)
      const outcome = await this.store.recordReconciliationPending(batch, message, schedule)
      this.logger.error(
        `支付批次自动回查异常: ${this.batchLogContext(outcome, 'RECONCILE')}, error=${message}`,
      )
      return outcome
    }
    this.logger.log(
      `支付批次自动回查响应: ${this.batchLogContext(batch, 'RECONCILE', result)}, upstreamStatus=${result.status}`,
    )
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      return this.store.recordReconciliationPending(batch, result.errorMessage, schedule)
    }
    return this.applyQueryResultAndConfirm(batch, result, schedule)
  }

  private async applyQueryResultAndConfirm(
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
    schedule: PaymentBatchReconciliationSchedule,
  ): Promise<ExecutablePaymentBatch> {
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      return this.store.recordReconciliationPending(batch, result.errorMessage, schedule)
    }
    let outcome: PaymentBatchApplyOutcome
    try {
      outcome = await this.applyQueryResult(batch, result, schedule)
    } catch (error) {
      return this.store.recordReconciliationPending(batch, this.errorMessage(error), schedule)
    }
    // Batch settlement and platform confirmation are separate outcomes. Publish the
    // persisted batch result first so a slow or interrupted confirmation cannot hide it.
    this.emitStatus(outcome.batch)
    this.logger.log(
      `支付批次状态更新: ${this.batchLogContext(outcome.batch, 'APPLY_RESULT', result)}, fromStatus=${batch.status}, toStatus=${outcome.batch.status}, pendingPlatformConfirmations=${outcome.paymentsToConfirm.length}`,
    )
    const confirmationResults = await mapWithConcurrency(
      outcome.paymentsToConfirm,
      PLATFORM_CONFIRM_CONCURRENCY,
      (payment) =>
        this.payments.confirmPlatform(
          {
            ...payment,
            batchId: outcome.batch.id,
            batchNo: outcome.batch.batchNo,
            batchUpstreamId: outcome.batch.upstreamId,
          },
          { suppressFailureNotification: true },
        ),
    )
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
      const succeeded = confirmationResults.filter(
        (payment) => payment.platformConfirmStatus === PlatformConfirmationStatus.SUCCESS,
      ).length
      this.logger.log(
        `支付批次标记付款汇总: ${this.batchLogContext(outcome.batch, 'PLATFORM_CONFIRM')}, total=${confirmationResults.length}, succeeded=${succeeded}, failed=${confirmationResults.length - succeeded}`,
      )
    }
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

  private batchOperationLockKey(tenantId: string, batchId: string): string {
    return `payment-batch:${tenantId}:${batchId}`
  }

  private isReconciliationDue(batch: ExecutablePaymentBatch): boolean {
    if (batch.nextReconcileAt === null) return true
    return batch.nextReconcileAt !== null && batch.nextReconcileAt.getTime() <= Date.now()
  }

  private batchLogContext(
    batch: ExecutablePaymentBatch,
    operation: string,
    result?: PaymentExecutionResult<AlipayBatchResponse>,
  ): string {
    const paymentRefs = batch.items
      .map(
        (item) =>
          `${item.paymentOrderId}/${item.paymentNo}/${item.sourceBusinessNo ?? 'unknown'}/${item.upstreamId ?? 'none'}`,
      )
      .join('|')
    return [
      `tenantId=${batch.tenantId}`,
      `merchantId=${batch.merchantId ?? 'unknown'}`,
      `batchId=${batch.id}`,
      `batchNo=${batch.batchNo}`,
      `batchUpstreamId=${result?.upstreamId ?? batch.upstreamId ?? 'none'}`,
      `operation=${operation}`,
      `batchStatus=${batch.status}`,
      `reconciliationAttempts=${batch.reconciliationAttempts}`,
      `itemCount=${batch.items.length}`,
      `paymentRefs=[${paymentRefs}]`,
    ].join(', ')
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const results = new Array<R>(items.length)
  let cursor = 0
  const worker = async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()),
  )
  return results
}
