import { PaymentBatchStatus, PaymentOrderStatus, PaymentSourceType } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type {
  AutomaticPaymentCandidate,
  AutomaticPaymentScope,
  C2cAutomaticPaymentStore,
  RecoverableBatch,
  RecoverablePayment,
} from './c2c-automatic-payment.types'

@Injectable()
export class TypeOrmC2cAutomaticPaymentStore implements C2cAutomaticPaymentStore {
  constructor(private readonly dataSource: DataSource) {}

  findCandidates(now: Date, limit: number): Promise<AutomaticPaymentCandidate[]> {
    return this.dataSource.query(
      `
        SELECT merchant_order."tenantId" AS "tenantId",
               merchant_order."merchantId" AS "merchantId",
               merchant_order.id AS "merchantOrderId",
               merchant."automaticPaymentExecutionMode" AS "executionMode",
               payment_order.id AS "paymentOrderId",
               payment_order.status AS "paymentOrderStatus",
               payment_order."executionMode" AS "paymentOrderExecutionMode"
        FROM merchant_order
        INNER JOIN merchant
          ON merchant.id = merchant_order."merchantId"
         AND merchant."tenantId" = merchant_order."tenantId"
        LEFT JOIN payment_order
          ON payment_order."tenantId" = merchant_order."tenantId"
         AND payment_order."merchantId" = merchant_order."merchantId"
         AND payment_order."sourceType" = $1
         AND payment_order."sourceBusinessNo" = merchant_order."platformOrderId"
        WHERE merchant.status = 'active'
          AND merchant."automaticPaymentEnabled" = true
          AND merchant_order.status = 'PENDING_PAYMENT'
          AND merchant_order.payable = true
          AND merchant_order."identityMatched" = true
          AND merchant_order."paymentMethod" = 'ALIPAY'
          AND merchant_order."fiatCurrency" = 'CNY'
          AND merchant_order."payeeIdentity" IS NOT NULL
          AND merchant_order."payeeName" IS NOT NULL
          AND (
            merchant_order."paymentDeadline" IS NULL
            OR merchant_order."paymentDeadline" > $2
          )
          AND (
            payment_order.id IS NULL
            OR payment_order.status IN ('PENDING_CONFIG', 'READY')
          )
        ORDER BY merchant_order."platformCreatedAt" ASC, merchant_order.id ASC
        LIMIT $3
      `,
      [PaymentSourceType.C2C_BUY, now, limit],
    )
  }

  findBatchScopes(limit: number): Promise<AutomaticPaymentScope[]> {
    return this.dataSource.query(
      `
        SELECT payment_order."tenantId" AS "tenantId",
               payment_order."merchantId" AS "merchantId"
        FROM payment_order
        INNER JOIN merchant
          ON merchant.id = payment_order."merchantId"
         AND merchant."tenantId" = payment_order."tenantId"
        WHERE merchant.status = 'active'
          AND merchant."automaticPaymentEnabled" = true
          AND payment_order."sourceType" = $1
          AND payment_order.status = 'READY'
          AND payment_order."executionMode" = 'BATCH'
        GROUP BY payment_order."tenantId", payment_order."merchantId"
        ORDER BY MIN(payment_order."createdAt") ASC
        LIMIT $2
      `,
      [PaymentSourceType.C2C_BUY, limit],
    )
  }

  findRecoverablePayments(limit: number): Promise<RecoverablePayment[]> {
    return this.dataSource.query(
      `
        SELECT payment_order.id,
               payment_order."tenantId" AS "tenantId",
               payment_order.status,
               payment_order."upstreamId" AS "upstreamId"
        FROM payment_order
        WHERE payment_order."sourceType" = $1
          AND payment_order.status = ANY($2::payment_order_status_enum[])
          AND (
            payment_order.status = 'PLATFORM_CONFIRM_PENDING'
            OR NOT EXISTS (
              SELECT 1
              FROM payment_batch_item
              WHERE payment_batch_item."paymentOrderId" = payment_order.id
            )
          )
        ORDER BY payment_order."updatedAt" ASC, payment_order.id ASC
        LIMIT $3
      `,
      [
        PaymentSourceType.C2C_BUY,
        [
          PaymentOrderStatus.SUBMITTING,
          PaymentOrderStatus.PROCESSING,
          PaymentOrderStatus.UNKNOWN,
          PaymentOrderStatus.PLATFORM_CONFIRM_PENDING,
        ],
        limit,
      ],
    )
  }

  findRecoverableBatches(limit: number): Promise<RecoverableBatch[]> {
    return this.dataSource.query(
      `
        SELECT id, "tenantId" AS "tenantId", status
        FROM payment_batch
        WHERE status = ANY($1::payment_batch_status_enum[])
        ORDER BY "updatedAt" ASC, id ASC
        LIMIT $2
      `,
      [
        [PaymentBatchStatus.SUBMITTING, PaymentBatchStatus.PROCESSING, PaymentBatchStatus.UNKNOWN],
        limit,
      ],
    )
  }

  async runLocked<T>(key: string, work: () => Promise<T>): Promise<T | undefined> {
    const runner = this.dataSource.createQueryRunner()
    await runner.connect()
    try {
      const [result] = (await runner.query(
        'SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired',
        [key],
      )) as Array<{ acquired: boolean }>
      if (!result?.acquired) return undefined
      try {
        return await work()
      } finally {
        await runner.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [key])
      }
    } finally {
      await runner.release()
    }
  }
}
