import { ConflictException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { PaymentExecutionStatus, type PaymentExecutionResult } from './payment-adapter.types'
import { PaymentOrderState } from './payment-order-state-machine'
import { PaymentNotSubmittedError, PlatformFundsExceptionError } from './payment-execution.errors'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'
import { PaymentSourceType, PlatformConfirmationStatus } from '@admin/database'

export { PaymentNotSubmittedError, PlatformFundsExceptionError } from './payment-execution.errors'

export interface ExecutablePaymentOrder {
  id: string
  tenantId: string
  status: PaymentOrderState
  upstreamId?: string | null
  batchId?: string
  batchNo?: string
  batchUpstreamId?: string | null
  merchantId?: string
  paymentNo?: string
  sourceBusinessNo?: string
  platformConfirmStatus?: PlatformConfirmationStatus
  platformConfirmAttempts?: number
  platformConfirmLastAttemptAt?: Date | null
  platformConfirmLastError?: string | null
  lastError?: string | null
  amount?: string
  currency?: string
  sourceType?: PaymentSourceType
}

export interface PaymentOrderStore {
  get: (tenantId: string, orderId: string) => Promise<ExecutablePaymentOrder>
  claim: (tenantId: string, orderId: string) => Promise<ExecutablePaymentOrder>
  transition: (
    order: ExecutablePaymentOrder,
    status: PaymentOrderState,
    detail?: { upstreamId?: string; errorMessage?: string },
  ) => Promise<ExecutablePaymentOrder>
  claimPlatformConfirmation: (
    order: ExecutablePaymentOrder,
    allowed: readonly PlatformConfirmationStatus[],
  ) => Promise<ExecutablePaymentOrder | null>
  completePlatformConfirmation: (order: ExecutablePaymentOrder) => Promise<ExecutablePaymentOrder>
  failPlatformConfirmation: (
    order: ExecutablePaymentOrder,
    errorMessage: string,
    fundsException: boolean,
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
  confirmPaid: (order: ExecutablePaymentOrder, options?: { queryOnly?: boolean }) => Promise<void>
}

export const PAYMENT_ORDER_STORE = Symbol('PAYMENT_ORDER_STORE')
export const PAYMENT_EXECUTOR = Symbol('PAYMENT_EXECUTOR')
export const PLATFORM_PAYMENT_CONFIRMER = Symbol('PLATFORM_PAYMENT_CONFIRMER')

@Injectable()
export class PaymentExecutionCoordinator {
  private readonly logger = new Logger(PaymentExecutionCoordinator.name)
  private readonly platformConfirmationsInFlight = new Map<
    string,
    Promise<ExecutablePaymentOrder>
  >()

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
    this.logger.log(`支付订单提交开始: ${this.paymentLogContext(claimed, 'SUBMIT')}`)
    let result: PaymentExecutionResult
    try {
      result = await this.executor.submit(claimed)
    } catch (error) {
      const message = this.errorMessage(error)
      const status =
        error instanceof PaymentNotSubmittedError
          ? PaymentOrderState.FAILED
          : PaymentOrderState.UNKNOWN
      const failed = await this.store.transition(claimed, status, {
        errorMessage: message,
      })
      this.logger.error(
        `支付订单提交异常: ${this.paymentLogContext(failed, 'SUBMIT')}, error=${message}`,
      )
      this.emitStatus(failed, message)
      return failed
    }
    this.logger.log(
      `支付订单上游提交响应: ${this.paymentLogContext(claimed, 'SUBMIT', result)}, upstreamStatus=${result.status}`,
    )
    const paid = await this.applyPaymentResult(claimed, result)
    if (paid.status !== PaymentOrderState.SUCCESS || paid.sourceType !== PaymentSourceType.C2C_BUY)
      return paid
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
    this.logger.log(`支付订单自动回查开始: ${this.paymentLogContext(order, 'RECONCILE')}`)
    let result: PaymentExecutionResult
    try {
      result = await this.executor.query(order)
    } catch (error) {
      const message = this.errorMessage(error)
      const unknown = await this.store.transition(order, PaymentOrderState.UNKNOWN, {
        errorMessage: message,
      })
      this.logger.error(
        `支付订单自动回查异常: ${this.paymentLogContext(unknown, 'RECONCILE')}, error=${message}`,
      )
      this.emitStatus(unknown, message)
      return unknown
    }
    this.logger.log(
      `支付订单自动回查响应: ${this.paymentLogContext(order, 'RECONCILE', result)}, upstreamStatus=${result.status}`,
    )
    const paid = await this.applyPaymentResult(order, result)
    if (paid.status !== PaymentOrderState.SUCCESS || paid.sourceType !== PaymentSourceType.C2C_BUY)
      return paid
    return this.confirmPlatform(paid)
  }

  /** Query the channel and expose its normalized result and raw response for the admin UI. */
  async queryUpstream(tenantId: string, orderId: string): Promise<PaymentUpstreamQueryResult> {
    const order = await this.store.get(tenantId, orderId)
    this.logger.log(`支付订单人工查单开始: ${this.paymentLogContext(order, 'QUERY_UPSTREAM')}`)
    try {
      const result = await this.executor.query(order)
      this.logger.log(
        `支付订单人工查单响应: ${this.paymentLogContext(order, 'QUERY_UPSTREAM', result)}, upstreamStatus=${result.status}`,
      )
      let current = order
      if (
        [
          PaymentOrderState.SUBMITTING,
          PaymentOrderState.PROCESSING,
          PaymentOrderState.UNKNOWN,
        ].includes(order.status)
      ) {
        current = await this.applyPaymentResult(order, result)
        if (
          current.status === PaymentOrderState.SUCCESS &&
          current.sourceType === PaymentSourceType.C2C_BUY
        )
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
      const message = this.errorMessage(error)
      let current = order
      if (
        [
          PaymentOrderState.SUBMITTING,
          PaymentOrderState.PROCESSING,
          PaymentOrderState.UNKNOWN,
        ].includes(order.status)
      ) {
        current = await this.store.transition(order, PaymentOrderState.UNKNOWN, {
          errorMessage: message,
        })
        this.emitStatus(current, message)
      }
      this.logger.error(
        `支付订单人工查单异常: ${this.paymentLogContext(current, 'QUERY_UPSTREAM')}, error=${message}`,
      )
      return {
        order: current,
        upstream: {
          status: PaymentExecutionStatus.UNKNOWN,
          errorMessage: message,
          raw: null,
        },
      }
    }
  }

  async confirmPlatform(
    order: ExecutablePaymentOrder,
    options: {
      manualRetry?: boolean
      recoverProcessing?: boolean
      suppressFailureNotification?: boolean
    } = {},
  ): Promise<ExecutablePaymentOrder> {
    const key = `${order.tenantId}:${order.id}`
    const existing = this.platformConfirmationsInFlight.get(key)
    if (existing) return existing
    const execution = (async () => {
      try {
        return await this.runPlatformConfirmation(order, options)
      } finally {
        this.platformConfirmationsInFlight.delete(key)
      }
    })()
    this.platformConfirmationsInFlight.set(key, execution)
    return execution
  }

  private async runPlatformConfirmation(
    order: ExecutablePaymentOrder,
    options: {
      manualRetry?: boolean
      recoverProcessing?: boolean
      suppressFailureNotification?: boolean
    } = {},
  ): Promise<ExecutablePaymentOrder> {
    if (order.status !== PaymentOrderState.SUCCESS)
      throw new ConflictException('只有支付成功的订单可以进行平台确认')
    const allowed = options.manualRetry
      ? [PlatformConfirmationStatus.FAILED]
      : options.recoverProcessing
        ? [PlatformConfirmationStatus.PROCESSING]
        : [PlatformConfirmationStatus.PENDING]
    const claimed = await this.store.claimPlatformConfirmation(order, allowed)
    if (!claimed) {
      this.logger.debug(
        `C2C 标记付款跳过重复认领: ${this.paymentLogContext(order, 'PLATFORM_CONFIRM')}, allowedStatus=${allowed.join('|')}`,
      )
      return this.store.get(order.tenantId, order.id)
    }
    const mode = options.recoverProcessing
      ? 'QUERY_ONLY'
      : options.manualRetry
        ? 'MANUAL_RETRY'
        : 'MARK_PAID'
    this.logger.log(`C2C 标记付款开始: ${this.paymentLogContext(claimed, mode)}`)
    try {
      await this.confirmer.confirmPaid(claimed, { queryOnly: options.recoverProcessing })
    } catch (error) {
      const message = this.errorMessage(error)
      const fundsException = error instanceof PlatformFundsExceptionError
      this.logger.error(
        `C2C 标记付款失败: ${this.paymentLogContext(claimed, mode)}, error=${message}`,
      )
      const failed = await this.store.failPlatformConfirmation(claimed, message, fundsException)
      if (fundsException) this.emitStatus(failed, message)
      if (
        failed.merchantId &&
        !fundsException &&
        !options.manualRetry &&
        !options.recoverProcessing &&
        !options.suppressFailureNotification
      ) {
        this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_PLATFORM_CONFIRMATION_FAILED, {
          tenantId: failed.tenantId,
          merchantId: failed.merchantId,
          paymentOrderId: failed.id,
          sourceBusinessNo: failed.sourceBusinessNo,
          errorMessage: message,
        })
      }
      return failed
    }
    const completed = await this.store.completePlatformConfirmation(claimed)
    this.logger.log(`C2C 标记付款成功: ${this.paymentLogContext(completed, mode)}`)
    return completed
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
    this.logger.log(
      `支付订单状态更新: ${this.paymentLogContext(transitioned, 'APPLY_RESULT', result)}, fromStatus=${order.status}, toStatus=${transitioned.status}, upstreamStatus=${result.status}`,
    )
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

  private paymentLogContext(
    order: ExecutablePaymentOrder,
    operation: string,
    result?: PaymentExecutionResult,
  ): string {
    return [
      `tenantId=${order.tenantId}`,
      `merchantId=${order.merchantId ?? 'unknown'}`,
      `paymentOrderId=${order.id}`,
      `paymentNo=${order.paymentNo ?? 'unknown'}`,
      `platformOrderId=${order.sourceBusinessNo ?? 'unknown'}`,
      `paymentUpstreamId=${result?.upstreamId ?? order.upstreamId ?? 'none'}`,
      `batchId=${order.batchId ?? 'none'}`,
      `batchNo=${order.batchNo ?? 'none'}`,
      `batchUpstreamId=${order.batchUpstreamId ?? 'none'}`,
      `operation=${operation}`,
      `paymentStatus=${order.status}`,
      `platformConfirmStatus=${order.platformConfirmStatus ?? 'unknown'}`,
      `platformConfirmAttempts=${order.platformConfirmAttempts ?? 0}`,
    ].join(', ')
  }
}
