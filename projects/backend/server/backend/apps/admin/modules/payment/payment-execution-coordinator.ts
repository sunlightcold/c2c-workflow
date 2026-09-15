import { ConflictException, Inject, Injectable, Optional } from '@nestjs/common'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import { PaymentOrderState } from './payment-order-state-machine'
import { PaymentNotSubmittedError, PlatformFundsExceptionError } from './payment-execution.errors'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'

export { PaymentNotSubmittedError, PlatformFundsExceptionError } from './payment-execution.errors'

export interface ExecutablePaymentOrder {
  id: string
  tenantId: string
  status: PaymentOrderState
  upstreamId?: string | null
  merchantId?: string
  paymentNo?: string
  sourceBusinessNo?: string
}

export interface PaymentOrderStore {
  get: (tenantId: string, orderId: string) => Promise<ExecutablePaymentOrder>
  claim: (tenantId: string, orderId: string) => Promise<ExecutablePaymentOrder>
  transition: (
    order: ExecutablePaymentOrder,
    status: PaymentOrderState,
    detail?: { upstreamId?: string; errorMessage?: string },
  ) => Promise<ExecutablePaymentOrder>
}

export interface PaymentExecutor {
  submit: (order: ExecutablePaymentOrder) => Promise<PaymentExecutionResult>
  query: (order: ExecutablePaymentOrder) => Promise<PaymentExecutionResult>
}

export interface PaymentUpstreamQueryResult {
  order: ExecutablePaymentOrder
  upstream: {
    status: PaymentExecutionStatus | 'UNKNOWN'
    upstreamId?: string
    errorMessage?: string
    raw: unknown
  }
}

export interface PlatformPaymentConfirmer {
  confirmPaid: (order: ExecutablePaymentOrder) => Promise<void>
}

export const PAYMENT_ORDER_STORE = Symbol('PAYMENT_ORDER_STORE')
export const PAYMENT_EXECUTOR = Symbol('PAYMENT_EXECUTOR')
export const PLATFORM_PAYMENT_CONFIRMER = Symbol('PLATFORM_PAYMENT_CONFIRMER')

@Injectable()
export class PaymentExecutionCoordinator {
  constructor(
    @Inject(PAYMENT_ORDER_STORE)
    private readonly store: PaymentOrderStore,
    @Inject(PAYMENT_EXECUTOR)
    private readonly executor: PaymentExecutor,
    @Inject(PLATFORM_PAYMENT_CONFIRMER)
    private readonly confirmer: PlatformPaymentConfirmer,
    @Optional() private readonly eventEmitter?: EventEmitterService,
  ) {}

  async submit(tenantId: string, orderId: string): Promise<ExecutablePaymentOrder> {
    const claimed = await this.store.claim(tenantId, orderId)
    let result: PaymentExecutionResult
    try {
      result = await this.executor.submit(claimed)
    } catch (error) {
      const status =
        error instanceof PaymentNotSubmittedError
          ? PaymentOrderState.FAILED
          : PaymentOrderState.UNKNOWN
      const failed = await this.store.transition(claimed, status, {
        errorMessage: this.errorMessage(error),
      })
      this.emitStatus(failed, this.errorMessage(error))
      return failed
    }
    const paid = await this.applyPaymentResult(claimed, result)
    if (paid.status !== PaymentOrderState.SUCCESS) return paid
    return this.confirmPlatform(paid)
  }

  async reconcile(tenantId: string, orderId: string): Promise<ExecutablePaymentOrder> {
    const order = await this.store.get(tenantId, orderId)
    if (
      ![
        PaymentOrderState.SUBMITTING,
        PaymentOrderState.PROCESSING,
        PaymentOrderState.UNKNOWN,
      ].includes(order.status)
    ) {
      throw new ConflictException('只有提交中、处理中或结果未知的支付订单可以回查')
    }
    let result: PaymentExecutionResult
    try {
      result = await this.executor.query(order)
    } catch (error) {
      const unknown = await this.store.transition(order, PaymentOrderState.UNKNOWN, {
        errorMessage: this.errorMessage(error),
      })
      this.emitStatus(unknown, this.errorMessage(error))
      return unknown
    }
    const paid = await this.applyPaymentResult(order, result)
    if (paid.status !== PaymentOrderState.SUCCESS) return paid
    return this.confirmPlatform(paid)
  }

  /** Query the channel and expose its normalized result and raw response for the admin UI. */
  async queryUpstream(tenantId: string, orderId: string): Promise<PaymentUpstreamQueryResult> {
    const order = await this.store.get(tenantId, orderId)
    try {
      const result = await this.executor.query(order)
      let current = order
      if (
        [
          PaymentOrderState.SUBMITTING,
          PaymentOrderState.PROCESSING,
          PaymentOrderState.UNKNOWN,
        ].includes(order.status)
      ) {
        current = await this.applyPaymentResult(order, result)
        if (current.status === PaymentOrderState.SUCCESS)
          current = await this.confirmPlatform(current)
      }
      return {
        order: current,
        upstream: {
          status: result.status,
          upstreamId: result.upstreamId,
          errorMessage: result.errorMessage,
          raw: result.raw,
        },
      }
    } catch (error) {
      let current = order
      if (
        [
          PaymentOrderState.SUBMITTING,
          PaymentOrderState.PROCESSING,
          PaymentOrderState.UNKNOWN,
        ].includes(order.status)
      ) {
        current = await this.store.transition(order, PaymentOrderState.UNKNOWN, {
          errorMessage: this.errorMessage(error),
        })
        this.emitStatus(current, this.errorMessage(error))
      }
      return {
        order: current,
        upstream: {
          status: PaymentExecutionStatus.UNKNOWN,
          errorMessage: this.errorMessage(error),
          raw: null,
        },
      }
    }
  }

  async confirmPlatform(order: ExecutablePaymentOrder): Promise<ExecutablePaymentOrder> {
    const pending =
      order.status === PaymentOrderState.PLATFORM_CONFIRM_PENDING
        ? order
        : await this.store.transition(order, PaymentOrderState.PLATFORM_CONFIRM_PENDING)
    try {
      await this.confirmer.confirmPaid(pending)
      const completed = await this.store.transition(pending, PaymentOrderState.COMPLETED)
      this.emitStatus(completed)
      return completed
    } catch (error) {
      const status =
        error instanceof PlatformFundsExceptionError
          ? PaymentOrderState.FUND_EXCEPTION
          : PaymentOrderState.PLATFORM_CONFIRM_PENDING
      const failed = await this.store.transition(pending, status, {
        errorMessage: this.errorMessage(error),
      })
      this.emitStatus(failed, this.errorMessage(error))
      return failed
    }
  }

  private async applyPaymentResult(order: ExecutablePaymentOrder, result: PaymentExecutionResult) {
    const statuses: Record<PaymentExecutionStatus, PaymentOrderState> = {
      [PaymentExecutionStatus.PROCESSING]: PaymentOrderState.PROCESSING,
      [PaymentExecutionStatus.SUCCESS]: PaymentOrderState.SUCCESS,
      [PaymentExecutionStatus.FAILED]: PaymentOrderState.FAILED,
      [PaymentExecutionStatus.UNKNOWN]: PaymentOrderState.UNKNOWN,
    }
    const transitioned = await this.store.transition(order, statuses[result.status], {
      upstreamId: result.upstreamId,
      errorMessage: result.errorMessage,
    })
    this.emitStatus(transitioned, result.errorMessage)
    return transitioned
  }

  private emitStatus(order: ExecutablePaymentOrder, errorMessage?: string): void {
    if (!order.merchantId) return
    this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_PAYMENT_STATUS, {
      tenantId: order.tenantId,
      merchantId: order.merchantId,
      paymentOrderId: order.id,
      paymentNo: order.paymentNo,
      sourceBusinessNo: order.sourceBusinessNo,
      status: order.status,
      upstreamId: order.upstreamId,
      errorMessage: errorMessage ?? null,
    })
  }

  private errorMessage(error: unknown) {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
