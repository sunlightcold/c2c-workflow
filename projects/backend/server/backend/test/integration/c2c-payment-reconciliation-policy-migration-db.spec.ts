/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { C2cPaymentReconciliationPolicy1789020000000 } from '@/apps/admin/database/migrations/c2c-payment-reconciliation-policy.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C payment reconciliation policy migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_payment_reconciliation_test_${process.pid}_${Date.now()}`
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

  it('adds durable batch scheduling state idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateC2cPaymentRouting(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await migrateC2cPaymentBatches(queryRunner.manager)

    const migration = new C2cPaymentReconciliationPolicy1789020000000()
    await migration.up(queryRunner)
    await migration.up(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = current_schema()
           AND table_name = 'payment_batch'
           AND column_name = ANY($1)
         ORDER BY column_name`,
        [['nextReconcileAt', 'reconciliationAttempts']],
      ),
    ).resolves.toEqual([
      { column_name: 'nextReconcileAt' },
      { column_name: 'reconciliationAttempts' },
    ])
    await expect(
      queryRunner.query(
        `SELECT indexname
         FROM pg_indexes
         WHERE schemaname = current_schema()
           AND indexname = 'idx_payment_batch_reconciliation_due'`,
      ),
    ).resolves.toEqual([{ indexname: 'idx_payment_batch_reconciliation_due' }])
  })
})
