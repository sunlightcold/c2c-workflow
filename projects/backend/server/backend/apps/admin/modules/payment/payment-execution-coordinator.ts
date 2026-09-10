import { Inject, Injectable } from '@nestjs/common'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import { PaymentOrderState } from './payment-order-state-machine'

export interface ExecutablePaymentOrder {
  id: string
  tenantId: string
  status: PaymentOrderState
  upstreamId?: string | null
}

export interface PaymentOrderStore {
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

export interface PlatformPaymentConfirmer {
  confirmPaid: (order: ExecutablePaymentOrder) => Promise<void>
}

export const PAYMENT_ORDER_STORE = Symbol('PAYMENT_ORDER_STORE')
export const PAYMENT_EXECUTOR = Symbol('PAYMENT_EXECUTOR')
export const PLATFORM_PAYMENT_CONFIRMER = Symbol('PLATFORM_PAYMENT_CONFIRMER')

export class PaymentNotSubmittedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaymentNotSubmittedError'
  }
}

@Injectable()
export class PaymentExecutionCoordinator {
  constructor(
    @Inject(PAYMENT_ORDER_STORE)
    private readonly store: PaymentOrderStore,
    @Inject(PAYMENT_EXECUTOR)
    private readonly executor: PaymentExecutor,
    @Inject(PLATFORM_PAYMENT_CONFIRMER)
    private readonly confirmer: PlatformPaymentConfirmer,
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
      return this.store.transition(claimed, status, {
        errorMessage: this.errorMessage(error),
      })
    }
    const paid = await this.applyPaymentResult(claimed, result)
    if (paid.status !== PaymentOrderState.SUCCESS) return paid
    return this.confirmPlatform(paid)
  }

  async confirmPlatform(order: ExecutablePaymentOrder): Promise<ExecutablePaymentOrder> {
    const pending =
      order.status === PaymentOrderState.PLATFORM_CONFIRM_PENDING
        ? order
        : await this.store.transition(order, PaymentOrderState.PLATFORM_CONFIRM_PENDING)
    try {
      await this.confirmer.confirmPaid(pending)
      return this.store.transition(pending, PaymentOrderState.COMPLETED)
    } catch (error) {
      return this.store.transition(pending, PaymentOrderState.PLATFORM_CONFIRM_PENDING, {
        errorMessage: this.errorMessage(error),
      })
    }
  }

  private applyPaymentResult(order: ExecutablePaymentOrder, result: PaymentExecutionResult) {
    const statuses: Record<PaymentExecutionStatus, PaymentOrderState> = {
      [PaymentExecutionStatus.PROCESSING]: PaymentOrderState.PROCESSING,
      [PaymentExecutionStatus.SUCCESS]: PaymentOrderState.SUCCESS,
      [PaymentExecutionStatus.FAILED]: PaymentOrderState.FAILED,
      [PaymentExecutionStatus.UNKNOWN]: PaymentOrderState.UNKNOWN,
    }
    return this.store.transition(order, statuses[result.status], {
      upstreamId: result.upstreamId,
      errorMessage: result.errorMessage,
    })
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }
}
