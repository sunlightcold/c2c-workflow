import { PaymentBatchStatus, PaymentSourceType } from '@admin/database'
import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common'
import type { AlipayBatchResponse } from './alipay-batch.adapter'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import type { ExecutablePaymentOrder } from './payment-execution-coordinator'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentNotSubmittedError } from './payment-execution.errors'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'

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
  items: ExecutablePaymentBatchItem[]
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
  ) => Promise<ExecutablePaymentBatch>
  markUnknown: (
    batch: ExecutablePaymentBatch,
    errorMessage?: string,
  ) => Promise<ExecutablePaymentBatch>
  fail: (batch: ExecutablePaymentBatch, errorMessage?: string) => Promise<ExecutablePaymentBatch>
  applyQuery: (
    batch: ExecutablePaymentBatch,
    result: PaymentExecutionResult<AlipayBatchResponse>,
  ) => Promise<PaymentBatchApplyOutcome>
}

export interface PaymentBatchExecutor {
  submit: (batch: ExecutablePaymentBatch) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
  query: (batch: ExecutablePaymentBatch) => Promise<PaymentExecutionResult<AlipayBatchResponse>>
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
          : await this.store.markUnknown(claimed, this.errorMessage(error))
      this.emitStatus(outcome, this.errorMessage(error))
      return outcome
    }
    if (result.status === PaymentExecutionStatus.FAILED) {
      const outcome = await this.store.fail(claimed, result.errorMessage)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      const outcome = await this.store.markUnknown(claimed, result.errorMessage)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    const submitted = await this.store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      result.upstreamId,
    )
    this.emitStatus(submitted)
    return this.queryAndApply(submitted)
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

  private async queryAndApply(batch: ExecutablePaymentBatch): Promise<ExecutablePaymentBatch> {
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.query(batch)
    } catch (error) {
      const outcome = await this.store.markUnknown(batch, this.errorMessage(error))
      this.emitStatus(outcome, this.errorMessage(error))
      return outcome
    }
    if (result.status === PaymentExecutionStatus.UNKNOWN) {
      const outcome = await this.store.markUnknown(batch, result.errorMessage)
      this.emitStatus(outcome, result.errorMessage)
      return outcome
    }
    let outcome: PaymentBatchApplyOutcome
    try {
      outcome = await this.store.applyQuery(batch, result)
    } catch (error) {
      const outcome = await this.store.markUnknown(batch, this.errorMessage(error))
      this.emitStatus(outcome, this.errorMessage(error))
      return outcome
    }
    for (const payment of outcome.paymentsToConfirm) {
      await this.payments.confirmPlatform(payment)
    }
    this.emitStatus(outcome.batch)
    return outcome.batch
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
