import {
  PaymentBatchStatus,
  PaymentOrderStatus,
  PaymentSourceType,
  PlatformConfirmationStatus,
} from '@admin/database'
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

  findCandidates(_now: Date, limit: number): Promise<AutomaticPaymentCandidate[]> {
    return this.dataSource.query(
      `
        SELECT merchant_order."tenantId" AS "tenantId",
               merchant_order."merchantId" AS "merchantId",
               merchant_order.id AS "merchantOrderId",
               merchant_order."platformOrderId" AS "sourceBusinessNo",
               payment_order.id AS "paymentOrderId",
               payment_order.status AS "paymentOrderStatus",
               payment_order."executionMode" AS "paymentOrderExecutionMode"
        FROM merchant_order
        INNER JOIN merchant
          ON merchant.id = merchant_order."merchantId"
         AND merchant."tenantId" = merchant_order."tenantId"
        INNER JOIN tenant
          ON tenant.id = merchant_order."tenantId"
        LEFT JOIN payment_order
          ON payment_order."tenantId" = merchant_order."tenantId"
         AND payment_order."merchantId" = merchant_order."merchantId"
         AND payment_order."sourceType" = $1
         AND payment_order."sourceBusinessNo" = merchant_order."platformOrderId"
        LEFT JOIN automatic_payment_failure_notice failure_notice
          ON failure_notice."tenantId" = merchant_order."tenantId"
         AND failure_notice."merchantId" = merchant_order."merchantId"
         AND failure_notice."referenceId" IN (merchant_order.id::text, merchant_order."platformOrderId")
         AND failure_notice.code IN ('C2C_PAYMENT_ORDER_NOT_CREATED', 'AUTOMATIC_PAYMENT_FAILED')
        WHERE tenant.status = 'active'
          AND merchant.status = 'active'
          AND merchant_order.status = 'PENDING_PAYMENT'
          AND merchant_order.payable = true
          AND failure_notice.id IS NULL
          AND (
            payment_order.id IS NULL
            OR payment_order.status IN ('PENDING_CONFIG', 'READY')
          )
        ORDER BY merchant_order."platformCreatedAt" ASC, merchant_order.id ASC
        LIMIT $2
      `,
      [PaymentSourceType.C2C_BUY, limit],
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
          AND payment_order.status = 'READY'
          AND payment_order."executionMode" = 'BATCH'
        GROUP BY payment_order."tenantId", payment_order."merchantId"
        ORDER BY MIN(payment_order."createdAt") ASC
        LIMIT $1
      `,
      [limit],
    )
  }

  findRecoverablePayments(limit: number): Promise<RecoverablePayment[]> {
    return this.dataSource.query(
      `
        SELECT payment_order.id,
               payment_order."tenantId" AS "tenantId",
               payment_order."merchantId" AS "merchantId",
               payment_order.status,
               payment_order."upstreamId" AS "upstreamId",
               payment_order."platformConfirmStatus" AS "platformConfirmStatus",
               payment_order."platformConfirmAttempts" AS "platformConfirmAttempts",
               payment_order."platformConfirmLastAttemptAt" AS "platformConfirmLastAttemptAt"
        FROM payment_order
        INNER JOIN merchant
          ON merchant.id = payment_order."merchantId"
         AND merchant."tenantId" = payment_order."tenantId"
        WHERE (
            payment_order.status = ANY($1::payment_order_status_enum[])
            AND NOT EXISTS (
              SELECT 1
              FROM payment_batch_item
              WHERE payment_batch_item."paymentOrderId" = payment_order.id
            )
          ) OR (
            payment_order.status = 'SUCCESS'
            AND (
              (
                payment_order."platformConfirmStatus" = $2
                AND (
                  merchant.platform <> 'OKX'
                  OR merchant."paidConfirmIntervalMaxMs" = 0
                  OR merchant."paidConfirmNextAt" IS NULL
                  OR merchant."paidConfirmNextAt" <= NOW()
                )
              )
              OR (
                payment_order."platformConfirmStatus" = $3
                AND payment_order."platformConfirmLastAttemptAt" <= NOW()
                  - (merchant."requestTimeoutMs" * 4 + 5000) * INTERVAL '1 millisecond'
                AND (
                  merchant.platform <> 'OKX'
                  OR merchant."paidConfirmIntervalMaxMs" = 0
                  OR merchant."paidConfirmNextAt" IS NULL
                  OR merchant."paidConfirmNextAt" <= NOW()
                )
              )
            )
          )
        ORDER BY payment_order."updatedAt" ASC, payment_order.id ASC
        LIMIT $4
      `,
      [
        [PaymentOrderStatus.SUBMITTING, PaymentOrderStatus.PROCESSING, PaymentOrderStatus.UNKNOWN],
        PlatformConfirmationStatus.PENDING,
        PlatformConfirmationStatus.PROCESSING,
        limit,
      ],
    )
  }

  findRecoverableBatches(limit: number): Promise<RecoverableBatch[]> {
    return this.dataSource.query(
      `
        SELECT id, "tenantId" AS "tenantId", "merchantId" AS "merchantId", status
        FROM payment_batch
        WHERE status = ANY($1::payment_batch_status_enum[])
          AND (
            "nextReconcileAt" <= NOW()
            OR "nextReconcileAt" IS NULL
          )
        ORDER BY "updatedAt" ASC, id ASC
        LIMIT $2
      `,
      [
        [PaymentBatchStatus.SUBMITTING, PaymentBatchStatus.PROCESSING, PaymentBatchStatus.UNKNOWN],
        limit,
      ],
    )
  }

  async claimFailureNotification(input: {
    tenantId: string
    merchantId: string
    code: string
    referenceId: string
    message: string
  }): Promise<boolean> {
    const [rows] = (await this.dataSource.query(
      `
        INSERT INTO automatic_payment_failure_notice
          ("tenantId", "merchantId", code, "referenceId", message)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT ("tenantId", "merchantId", code, "referenceId") DO NOTHING
        RETURNING id
      `,
      [input.tenantId, input.merchantId, input.code, input.referenceId, input.message],
    )) as [Array<{ id: string }>, number]
    return rows.length === 1
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
