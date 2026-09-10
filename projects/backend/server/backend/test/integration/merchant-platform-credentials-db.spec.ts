/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Merchant platform credentials database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `merchant_credential_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      synchronize: false,
      logging: false,
    })
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

  it('creates the versioned credential store idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform)
      VALUES ('00000000-0000-4000-8000-000000000020', '${C2C_FOUNDATION_IDS.headquartersTenant}', 'm1', 'M1', 'BINANCE')
    `)
    await queryRunner.query(`
      INSERT INTO merchant_platform_credential
        ("tenantId", "merchantId", platform, version, "credentialRef", "clientType")
      VALUES
        ('${C2C_FOUNDATION_IDS.headquartersTenant}', '00000000-0000-4000-8000-000000000020', 'BINANCE', 1, 'vault://binance/v1', 'WEB')
    `)
    await queryRunner.query(`UPDATE merchant_platform_credential SET status = 'disabled'`)
    await queryRunner.query(`
      INSERT INTO merchant_platform_credential
        ("tenantId", "merchantId", platform, version, "credentialRef", "clientType")
      VALUES
        ('${C2C_FOUNDATION_IDS.headquartersTenant}', '00000000-0000-4000-8000-000000000020', 'BINANCE', 2, 'vault://binance/v2', 'WEB')
    `)
    const rows = (await queryRunner.query(`
      SELECT version, status FROM merchant_platform_credential ORDER BY version
    `)) as Array<{ version: number; status: string }>
    expect(rows).toEqual([
      { version: 1, status: 'disabled' },
      { version: 2, status: 'active' },
    ])
  })

  it('rejects a second active version for one merchant', async () => {
    await queryRunner.query('SAVEPOINT before_duplicate_active')
    await expect(
      queryRunner.query(`
        INSERT INTO merchant_platform_credential
          ("tenantId", "merchantId", platform, version, "credentialRef", "clientType")
        VALUES
          ('${C2C_FOUNDATION_IDS.headquartersTenant}', '00000000-0000-4000-8000-000000000020', 'BINANCE', 3, 'vault://binance/v3', 'WEB')
      `),
    ).rejects.toMatchObject({ code: '23505' })
    await queryRunner.query('ROLLBACK TO SAVEPOINT before_duplicate_active')
  })
})
