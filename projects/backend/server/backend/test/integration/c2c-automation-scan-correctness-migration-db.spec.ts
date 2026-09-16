/// <reference types="jest" />

import { migrateC2cAutomationScanCorrectness } from '@/apps/admin/database/migrations/c2c-automation-scan-correctness.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C automation scan correctness migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_automation_scan_test_${process.pid}_${Date.now()}`
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
    await queryRunner.query(`
      CREATE TABLE merchant (id uuid PRIMARY KEY);
      CREATE TABLE merchant_order (
        id uuid PRIMARY KEY,
        "tenantId" uuid NOT NULL,
        "merchantId" uuid NOT NULL,
        "platformOrderId" varchar(128) NOT NULL,
        status varchar(32) NOT NULL,
        "appealStatus" varchar(32),
        "autoAppealStatus" varchar(32),
        "autoAppealNextAttemptAt" timestamptz,
        "platformUpdatedAt" timestamptz
      );
      CREATE TABLE payment_order (
        id uuid PRIMARY KEY,
        "tenantId" uuid NOT NULL,
        "merchantId" uuid NOT NULL,
        "sourceType" varchar(32) NOT NULL,
        "sourceBusinessNo" varchar(128) NOT NULL,
        status varchar(32) NOT NULL,
        "platformConfirmStatus" varchar(16) NOT NULL,
        "platformConfirmedAt" timestamptz
      );
      CREATE INDEX idx_merchant_order_auto_appeal_due
        ON merchant_order ("tenantId", "merchantId", "autoAppealNextAttemptAt", "platformUpdatedAt");
    `)
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

  it('adds scan telemetry and indexes the actual confirmation timestamp idempotently', async () => {
    await migrateC2cAutomationScanCorrectness(queryRunner.manager)
    await migrateC2cAutomationScanCorrectness(queryRunner.manager)

    const columns = (await queryRunner.query(`
      SELECT "column_name"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'merchant'
      ORDER BY "column_name"
    `)) as Array<{ column_name: string }>
    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'autoAppealLastError',
      'autoAppealLastScanAt',
      'c2cChatOrderCompletedLastError',
      'c2cChatOrderCompletedLastScanAt',
      'id',
    ])

    const indexes = (await queryRunner.query(`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname IN (
          'idx_merchant_order_auto_appeal_due',
          'idx_payment_order_auto_appeal_confirmed'
        )
      ORDER BY indexname
    `)) as Array<{ indexname: string; indexdef: string }>
    expect(indexes).toHaveLength(2)
    expect(indexes[0].indexdef).not.toContain('platformUpdatedAt')
    expect(indexes[1].indexdef).toContain('platformConfirmedAt')
  })
})
