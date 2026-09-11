/// <reference types="jest" />

import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'
import {
  migratePaymentAccountCredentials,
  readPaymentAccountCredentialState,
} from '@/apps/admin/database/migrations/payment-account-credentials.migration'
import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'

describe('payment account credential migration (PostgreSQL integration)', () => {
  const { postgres } = developmentConfig.admin
  const schema = `payment_account_credentials_test_${process.pid}_${Date.now()}`
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

  it('adds one-account credential metadata and text-sized encrypted storage idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migratePaymentAccountCredentials(queryRunner.manager)
    await migratePaymentAccountCredentials(queryRunner.manager)

    await expect(readPaymentAccountCredentialState(queryRunner.manager)).resolves.toEqual([
      { column_name: 'credentialAppId', data_type: 'character varying' },
      { column_name: 'credentialAuthMode', data_type: 'character varying' },
      { column_name: 'credentialGateway', data_type: 'character varying' },
      { column_name: 'credentialRef', data_type: 'text' },
      { column_name: 'credentialUpdatedAt', data_type: 'timestamp with time zone' },
    ])
  })
})
