/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  migrateC2cBusinessFoundation,
  readC2cBusinessFoundationState,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C business foundation migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_foundation_test_${process.pid}_${Date.now()}`
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

  it('creates the tenant, merchant and payment configuration schema idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await expect(readC2cBusinessFoundationState(queryRunner.manager)).resolves.toEqual({
      tables: expect.arrayContaining([
        'tenant',
        'merchant',
        'payment_platform',
        'payment_channel',
        'payment_account',
        'payment_account_channel',
        'merchant_payment_plan',
      ]),
      channelCodes: ['ALIPAY_BATCH_PAY_V2', 'ALIPAY_MERCHANT_TRANSFER'],
    })
  })

  it('enforces one headquarters tenant and tenant-local merchant codes', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await queryRunner.query('SAVEPOINT before_duplicate_headquarters')
    await expect(
      queryRunner.query(
        `INSERT INTO tenant (type, code, name) VALUES ('HEADQUARTERS_SELF', 'HQ2', 'HQ2')`,
      ),
    ).rejects.toMatchObject({ code: '23505' })
    await queryRunner.query('ROLLBACK TO SAVEPOINT before_duplicate_headquarters')
    await queryRunner.query(
      `INSERT INTO tenant (id, type, code, name) VALUES ('00000000-0000-4000-8000-000000000010', 'AGENT', 'AG1', 'Agent')`,
    )
    await queryRunner.query(
      `INSERT INTO merchant ("tenantId", code, name, platform) VALUES ('00000000-0000-4000-8000-000000000010', 'm1', 'M1', 'BINANCE')`,
    )
    await queryRunner.query('SAVEPOINT before_duplicate_merchant')
    await expect(
      queryRunner.query(
        `INSERT INTO merchant ("tenantId", code, name, platform) VALUES ('00000000-0000-4000-8000-000000000010', 'm1', 'M2', 'OKX')`,
      ),
    ).rejects.toMatchObject({ code: '23505' })
    await queryRunner.query('ROLLBACK TO SAVEPOINT before_duplicate_merchant')
  })
})
