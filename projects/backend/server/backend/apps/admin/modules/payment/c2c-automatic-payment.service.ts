import { PaymentExecutionMode, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { C2cMerchantPaymentService } from './c2c-merchant-payment.service'
import type {
  AutomaticPaymentCandidate,
  C2cAutomaticPaymentStore,
} from './c2c-automatic-payment.types'
import { PaymentBatchExecutionCoordinator } from './payment-batch-execution-coordinator'
import { PaymentBatchService } from './payment-batch.service'
import { PaymentExecutionCoordinator } from './payment-execution-coordinator'
import { PaymentOrderService } from './payment-order.service'
import { EVENT_KEYS, EventEmitterService } from '../event-emitter'

export const C2C_AUTOMATIC_PAYMENT_STORE = Symbol('C2C_AUTOMATIC_PAYMENT_STORE')
const AUTOMATION_LIMIT = 100

@Injectable()
export class C2cAutomaticPaymentService {
  private readonly logger = new Logger(C2cAutomaticPaymentService.name)

  constructor(
    @Inject(C2C_AUTOMATIC_PAYMENT_STORE) private readonly store: C2cAutomaticPaymentStore,
    private readonly merchantPayments: C2cMerchantPaymentService,
    private readonly paymentOrders: PaymentOrderService,
    private readonly payments: PaymentExecutionCoordinator,
    private readonly batches: PaymentBatchService,
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

  async submitReadyBatches() {
    const scopes = await this.store.findBatchScopes(AUTOMATION_LIMIT)
    const groups = (
      await Promise.all(
        scopes.map((scope) =>
          this.batches.findReadyGroups(scope.tenantId, scope.merchantId, PaymentSourceType.C2C_BUY),
        ),
      )
    ).flatMap((readyGroups, index) => readyGroups.map((group) => ({ ...scopes[index], ...group })))
    return this.runItems(groups, (group) =>
      this.store.runLocked(`automatic-batch:${group.paymentOrderIds[0]}`, async () => {
        const created = await this.batches.create(group.tenantId, group.paymentOrderIds)
        return this.batchExecution.submit(group.tenantId, created.batch.id)
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
        payment.status === PaymentOrderStatus.PLATFORM_CONFIRM_PENDING
          ? this.payments.confirmPlatform(payment)
          : this.payments.reconcile(payment.tenantId, payment.id),
      ),
    )
    const batchResult = await this.runItems(batches, (batch) =>
      this.store.runLocked(`batch-recovery:${batch.id}`, () =>
        this.batchExecution.reconcile(batch.tenantId, batch.id),
      ),
    )
    return { payments: paymentResult, batches: batchResult }
  }

  private async processCandidate(candidate: AutomaticPaymentCandidate) {
    if (!candidate.paymentOrderId) {
      return this.merchantPayments.create(
        candidate.tenantId,
        candidate.merchantId,
        candidate.merchantOrderId,
        candidate.executionMode,
      )
    }
    let payment = {
      id: candidate.paymentOrderId,
      status: candidate.paymentOrderStatus!,
      executionMode: candidate.paymentOrderExecutionMode!,
    }
    if (payment.status === PaymentOrderStatus.PENDING_CONFIG) {
      payment = await this.paymentOrders.rematch(candidate.tenantId, payment.id)
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
    for (const item of items) {
      try {
        await work(item)
        succeeded += 1
      } catch (error) {
        failed += 1
        this.logger.error(`自动支付任务处理失败: ${this.errorMessage(error)}`)
        const scoped = item as Partial<{
          tenantId: string
          merchantId: string
          id: string
          merchantOrderId: string
          batchNo: string
        }>
        if (scoped.tenantId) {
          this.eventEmitter?.emit(EVENT_KEYS.TELEGRAM_EXCEPTION, {
            tenantId: scoped.tenantId,
            merchantId: scoped.merchantId,
            code: 'AUTOMATIC_PAYMENT_FAILED',
            message: this.errorMessage(error),
            referenceId: scoped.merchantOrderId ?? scoped.batchNo ?? scoped.id,
          })
        }
      }
    }
    return { found: items.length, succeeded, failed }
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
