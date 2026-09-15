/// <reference types="jest" />

import { migrateC2cAutomaticPayments } from '@/apps/admin/database/migrations/c2c-automatic-payments.migration'
import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { C2cPaymentPlanAutomation1789021000000 } from '@/apps/admin/database/migrations/c2c-payment-plan-automation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { C2C_FOUNDATION_IDS } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C payment plan automation migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_plan_automation_test_${process.pid}_${Date.now()}`
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

  it('adds the plan flag and backfills the route matching the former merchant mode', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateC2cPaymentRouting(queryRunner.manager)
    await migrateC2cAutomaticPayments(queryRunner.manager)

    const tenantId = '51000000-0000-4000-8000-000000000001'
    const merchantId = '51000000-0000-4000-8000-000000000002'
    const accountId = '51000000-0000-4000-8000-000000000003'
    const bindingId = '51000000-0000-4000-8000-000000000004'
    await queryRunner.query(
      `INSERT INTO tenant (id, type, code, name, status, timezone, "systemLocked")
       VALUES ($1, 'AGENT', 'plan-auto-test', 'Plan Auto Test', 'active', 'Asia/Shanghai', false)`,
      [tenantId],
    )
    await queryRunner.query(
      `INSERT INTO merchant (
         id, "tenantId", code, name, platform, status,
         "automaticPaymentEnabled", "automaticPaymentExecutionMode"
       ) VALUES ($1, $2, 'merchant-auto', 'Merchant Auto', 'BINANCE', 'active', true, 'INSTANT')`,
      [merchantId, tenantId],
    )
    await queryRunner.query(
      `INSERT INTO payment_account (
         id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef", status
       ) VALUES ($1, $2, $3, 'account-auto', 'Account Auto', '2088000000000000', 'env://TEST', 'active')`,
      [accountId, tenantId, C2C_FOUNDATION_IDS.alipayPlatform],
    )
    await queryRunner.query(
      `INSERT INTO payment_account_channel (
         id, "paymentAccountId", "channelId", "concurrencyLimit", status
       ) VALUES ($1, $2, $3, 1, 'active')`,
      [bindingId, accountId, C2C_FOUNDATION_IDS.alipayMerchantTransferChannel],
    )
    await queryRunner.query(
      `INSERT INTO merchant_payment_plan (
         "tenantId", "merchantId", scene, currency, "paymentAccountId",
         "paymentAccountChannelId", priority, weight, status
       ) VALUES ($1, $2, 'C2C_BUY', 'CNY', $3, $4, 100, 100, 'active')`,
      [tenantId, merchantId, accountId, bindingId],
    )

    const migration = new C2cPaymentPlanAutomation1789021000000()
    await migration.up(queryRunner)
    await migration.up(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT "automaticPaymentEnabled" FROM merchant_payment_plan WHERE "merchantId" = $1`,
        [merchantId],
      ),
    ).resolves.toEqual([{ automaticPaymentEnabled: true }])
    await expect(
      queryRunner.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = 'idx_merchant_payment_plan_automatic_match'`,
      ),
    ).resolves.toEqual([{ indexname: 'idx_merchant_payment_plan_automatic_match' }])
  })
})
