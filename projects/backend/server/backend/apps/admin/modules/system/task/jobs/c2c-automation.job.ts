import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { C2cOrderSyncService } from '../../../c2c-order/c2c-order-sync.service'
import { C2C_ORDER_SYNC_STORE } from '../../../c2c-order/c2c-order.tokens'
import type { C2cOrderSyncStore } from '../../../c2c-order/c2c-order-sync.types'
import { C2cAutomaticPaymentService } from '../../../payment/c2c-automatic-payment.service'
import { C2cAutoAppealService } from '../../../c2c-order/c2c-auto-appeal.service'
import { C2cCompletionReplyService } from '../../../c2c-order/c2c-completion-reply.service'
import { ScheduleTask } from '../task.decorator'

const SYNC_CLAIM_LIMIT = 20
const SYNC_LEASE_MS = 2 * 60_000

@ScheduleTask()
@Injectable()
export class C2cAutomationJob {
  private readonly logger = new Logger(C2cAutomationJob.name)

  constructor(
    @Inject(C2C_ORDER_SYNC_STORE) private readonly syncStore: C2cOrderSyncStore,
    private readonly orderSync: C2cOrderSyncService,
    private readonly automaticPayments: C2cAutomaticPaymentService,
    @Inject(C2cAutoAppealService)
    private readonly autoAppeals: Pick<C2cAutoAppealService, 'scanAll'>,
    @Inject(C2cCompletionReplyService)
    private readonly completionReplies: Pick<C2cCompletionReplyService, 'scanAll'>,
  ) {}

  async syncDueOrders(now = new Date()) {
    const scopes = await this.syncStore.claimDue(randomUUID(), now, SYNC_CLAIM_LIMIT, SYNC_LEASE_MS)
    let succeeded = 0
    let failed = 0
    let created = 0
    for (const scope of scopes) {
      try {
        const result = await this.orderSync.sync(scope.tenantId, scope.merchantId, now)
        created += result.created ?? 0
        succeeded += 1
      } catch (error) {
        failed += 1
        this.logger.error(
          `商家订单自动同步失败 tenant=${scope.tenantId} merchant=${scope.merchantId}: ${this.errorMessage(error)}`,
        )
      }
    }
    // The discovery and payment schedulers intentionally remain separate so
    // existing payment orders can be retried independently.  A newly synced
    // order, however, must not wait for the next repeat-job tick: BullMQ does
    // not guarantee which of the two 5-second jobs runs first.  Process the
    // just-committed orders once before reporting the discovery run complete.
    const payments = created > 0 ? await this.processAutomaticPayments(now) : undefined
    return {
      claimed: scopes.length,
      succeeded,
      failed,
      ...(payments ? { payments } : {}),
    }
  }

  async processAutomaticPayments(now = new Date()) {
    const orders = await this.automaticPayments.createAndSubmit(now)
    const batches = await this.automaticPayments.submitReadyBatches(now)
    return { orders, batches }
  }

  recoverPayments() {
    return this.automaticPayments.recover()
  }

  processAutomaticAppeals(now = new Date()) {
    return this.autoAppeals.scanAll(now)
  }

  processCompletionReplies(now = new Date()) {
    return this.completionReplies.scanAll(now)
  }

  private errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 512)
  }
}
