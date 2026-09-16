/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cAutomaticPaymentFailureNotices } from '@/apps/admin/database/migrations/c2c-automatic-payment-failure-notices.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C automatic payment failure notices migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_payment_failure_notice_test_${process.pid}_${Date.now()}`
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

  it('creates an idempotent failure-notice ledger', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cAutomaticPaymentFailureNotices(queryRunner.manager)
    await migrateC2cAutomaticPaymentFailureNotices(queryRunner.manager)

    const tenantId = '52000000-0000-4000-8000-000000000001'
    const merchantId = '52000000-0000-4000-8000-000000000002'
    await queryRunner.query(
      `INSERT INTO tenant (id, type, code, name, status, timezone, "systemLocked")
       VALUES ($1, 'AGENT', 'notice-test', 'Notice Test', 'active', 'Asia/Shanghai', false)`,
      [tenantId],
    )
    await queryRunner.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform, status)
       VALUES ($1, $2, 'notice-merchant', 'Notice Merchant', 'BINANCE', 'active')`,
      [merchantId, tenantId],
    )

    const insert = `
      INSERT INTO automatic_payment_failure_notice
        ("tenantId", "merchantId", code, "referenceId", message)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT ("tenantId", "merchantId", code, "referenceId") DO NOTHING
      RETURNING id
    `
    await expect(
      queryRunner.query(insert, [
        tenantId,
        merchantId,
        'AUTOMATIC_PAYMENT_FAILED',
        'order-1',
        '404',
      ]),
    ).resolves.toHaveLength(1)
    await expect(
      queryRunner.query(insert, [
        tenantId,
        merchantId,
        'AUTOMATIC_PAYMENT_FAILED',
        'order-1',
        '404',
      ]),
    ).resolves.toHaveLength(0)
  })
})
