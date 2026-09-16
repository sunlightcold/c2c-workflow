/// <reference types="jest" />

import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentPlatformStateSeparation } from '@/apps/admin/database/migrations/c2c-payment-platform-state-separation.migration'
import { migrateC2cPlatformConfirmationControl } from '@/apps/admin/database/migrations/c2c-platform-confirmation-control.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C payment/platform state separation migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_payment_state_separation_${process.pid}_${Date.now()}`
  const merchantId = '61000000-0000-4000-8000-000000000001'
  const accountId = '62000000-0000-4000-8000-000000000001'
  const accountChannelId = '63000000-0000-4000-8000-000000000001'
  const planId = '64000000-0000-4000-8000-000000000001'
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`)
  })

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction()
    if (queryRunner && !queryRunner.isReleased) await queryRunner.release()
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('converts legacy mixed states and creates the SUCCESS recovery index idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateC2cPlatformConfirmationControl(queryRunner)
    await seedPaymentDependencies()
    await insertPayment(
      '65000000-0000-4000-8000-000000000001',
      'LEGACY-PENDING',
      'PLATFORM_CONFIRM_PENDING',
      'FAILED',
      'mark paid timeout',
    )
    await insertPayment(
      '65000000-0000-4000-8000-000000000002',
      'LEGACY-COMPLETED',
      'COMPLETED',
      'SUCCESS',
      null,
    )

    await migrateC2cPaymentPlatformStateSeparation(queryRunner)
    await migrateC2cPaymentPlatformStateSeparation(queryRunner)

    const rows = (await queryRunner.query(
      `SELECT "sourceBusinessNo", status, "platformConfirmStatus", "lastError", "platformConfirmLastError"
       FROM payment_order ORDER BY "sourceBusinessNo"`,
    )) as Array<Record<string, string | null>>
    expect(rows).toEqual([
      {
        sourceBusinessNo: 'LEGACY-COMPLETED',
        status: 'SUCCESS',
        platformConfirmStatus: 'SUCCESS',
        lastError: null,
        platformConfirmLastError: null,
      },
      {
        sourceBusinessNo: 'LEGACY-PENDING',
        status: 'SUCCESS',
        platformConfirmStatus: 'FAILED',
        lastError: null,
        platformConfirmLastError: 'mark paid timeout',
      },
    ])
    const [index] = (await queryRunner.query(
      `SELECT indexdef FROM pg_indexes
       WHERE schemaname = current_schema()
         AND indexname = 'idx_payment_order_platform_confirm_recovery'`,
    )) as Array<{ indexdef: string }>
    expect(index.indexdef).toContain("status = 'SUCCESS'")
    expect(index.indexdef).toContain('"platformConfirmStatus"')
  })

  async function seedPaymentDependencies() {
    await queryRunner.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform, status)
       VALUES ($1, $2, 'STATE_TEST', 'State test merchant', 'BINANCE', 'active')`,
      [merchantId, C2C_FOUNDATION_IDS.headquartersTenant],
    )
    await queryRunner.query(
      `INSERT INTO payment_account
         (id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef", status)
       VALUES ($1, $2, $3, 'STATE_TEST', 'State test account', 'external', 'env://TEST', 'active')`,
      [accountId, C2C_FOUNDATION_IDS.headquartersTenant, C2C_FOUNDATION_IDS.alipayPlatform],
    )
    await queryRunner.query(
      `INSERT INTO payment_account_channel
         (id, "paymentAccountId", "channelId", "concurrencyLimit", status)
       VALUES ($1, $2, $3, 1, 'active')`,
      [accountChannelId, accountId, C2C_FOUNDATION_IDS.alipayMerchantTransferChannel],
    )
    await queryRunner.query(
      `INSERT INTO merchant_payment_plan
         (id, "tenantId", "merchantId", scene, currency, "paymentAccountId", "paymentAccountChannelId", priority, weight, status)
       VALUES ($1, $2, $3, 'C2C_BUY', 'CNY', $4, $5, 100, 100, 'active')`,
      [planId, C2C_FOUNDATION_IDS.headquartersTenant, merchantId, accountId, accountChannelId],
    )
  }

  async function insertPayment(
    id: string,
    sourceBusinessNo: string,
    status: string,
    platformConfirmStatus: string,
    lastError: string | null,
  ) {
    await queryRunner.query(
      `INSERT INTO payment_order
         (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo",
          amount, currency, "payeeIdentity", "payeeName", "paymentPlanId", "paymentAccountId",
          "paymentAccountChannelId", status, "platformConfirmStatus", "lastError")
       VALUES ($1, $2, $3, 'C2C_BUY', $4, $5, 100, 'CNY', 'buyer@example.com', 'Buyer',
         $6, $7, $8, $9, $10, $11)`,
      [
        id,
        C2C_FOUNDATION_IDS.headquartersTenant,
        merchantId,
        sourceBusinessNo,
        `PAY-${sourceBusinessNo}`,
        planId,
        accountId,
        accountChannelId,
        status,
        platformConfirmStatus,
        lastError,
      ],
    )
  }
})
