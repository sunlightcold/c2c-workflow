/// <reference types="jest" />

import { migrateC2cAutomaticPayments } from '@/apps/admin/database/migrations/c2c-automatic-payments.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C automatic payments migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_automatic_payment_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      synchronize: false,
      logging: false,
    })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
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

  it('adds disabled-by-default automatic payment settings idempotently', async () => {
    await queryRunner.query(`
      CREATE TYPE business_status_enum AS ENUM ('active', 'disabled');
      CREATE TYPE payment_execution_mode_enum AS ENUM ('INSTANT', 'BATCH');
      CREATE TABLE merchant (
        id uuid PRIMARY KEY,
        "tenantId" uuid NOT NULL,
        code varchar(32) NOT NULL,
        name varchar(100) NOT NULL,
        platform varchar(32) NOT NULL,
        status business_status_enum NOT NULL DEFAULT 'active'
      );
    `)
    await migrateC2cAutomaticPayments(queryRunner.manager)
    await migrateC2cAutomaticPayments(queryRunner.manager)
    const [merchant] = await queryRunner.query(
      `
        INSERT INTO merchant (id, "tenantId", code, name, platform)
        VALUES (
          '00000000-0000-4000-8000-000000000002',
          '00000000-0000-4000-8000-000000000001',
          'AUTO_TEST', 'Auto Test', 'BINANCE'
        )
        RETURNING "automaticPaymentEnabled", "automaticPaymentExecutionMode"
      `,
    )
    expect(merchant).toEqual({
      automaticPaymentEnabled: false,
      automaticPaymentExecutionMode: 'INSTANT',
    })
  })
})
