import { PaymentBatchStatus, PaymentSourceType } from '@admin/database'
import { ConflictException, Inject, Injectable } from '@nestjs/common'
import type { AlipayBatchResponse } from './alipay-batch.adapter'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import type { ExecutablePaymentOrder } from './payment-execution-coordinator'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentNotSubmittedError } from './payment-execution.errors'

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
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.submit(claimed)
    } catch (error) {
      return error instanceof PaymentNotSubmittedError
        ? this.store.fail(claimed, this.errorMessage(error))
        : this.store.markUnknown(claimed, this.errorMessage(error))
    }
    if (result.status === PaymentExecutionStatus.FAILED)
      return this.store.fail(claimed, result.errorMessage)
    if (result.status === PaymentExecutionStatus.UNKNOWN)
      return this.store.markUnknown(claimed, result.errorMessage)
    const submitted = await this.store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      result.upstreamId,
    )
    return this.queryAndApply(submitted)
  }

  async reconcile(tenantId: string, batchId: string): Promise<ExecutablePaymentBatch> {
    const batch = await this.store.prepare(tenantId, batchId)
    if (![PaymentBatchStatus.PROCESSING, PaymentBatchStatus.UNKNOWN].includes(batch.status))
      throw new ConflictException('只有处理中或结果未知的支付批次可以回查')
    return this.queryAndApply(batch)
  }

  private async queryAndApply(batch: ExecutablePaymentBatch): Promise<ExecutablePaymentBatch> {
    let result: PaymentExecutionResult<AlipayBatchResponse>
    try {
      result = await this.executor.query(batch)
    } catch (error) {
      return this.store.markUnknown(batch, this.errorMessage(error))
    }
    if (result.status === PaymentExecutionStatus.UNKNOWN)
      return this.store.markUnknown(batch, result.errorMessage)
    let outcome: PaymentBatchApplyOutcome
    try {
      outcome = await this.store.applyQuery(batch, result)
    } catch (error) {
      return this.store.markUnknown(batch, this.errorMessage(error))
    }
    for (const payment of outcome.paymentsToConfirm) {
      await this.payments.confirmPlatform(payment)
    }
    return outcome.batch
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
