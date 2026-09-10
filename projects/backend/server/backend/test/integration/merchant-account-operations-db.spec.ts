/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Merchant account operations database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `merchant_account_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({ type: 'postgres', ...postgres, schema, synchronize: false })
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

  it('adds merchant account configuration and encrypted credential metadata idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await migrateC2cMerchantAccountOperations(queryRunner.manager)
    await migrateC2cMerchantAccountOperations(queryRunner.manager)
    await queryRunner.query(`
      INSERT INTO merchant (
        id, "tenantId", code, name, platform, "externalMerchantId", "apiBaseUrl",
        "botCode", "chatId"
      ) VALUES (
        '00000000-0000-4000-8000-000000000020',
        '${C2C_FOUNDATION_IDS.headquartersTenant}',
        'main-account', 'Main account', 'BINANCE', 'binance-merchant-1',
        'http://127.0.0.1:13002/upstreams/binance', 'PAY_BOT', '-10001'
      )
    `)
    await queryRunner.query(`
      INSERT INTO merchant_platform_credential (
        "tenantId", "merchantId", platform, version, "credentialRef", "authMode",
        "apiBaseUrl", "clientType", "requestTimeoutMs"
      ) VALUES (
        '${C2C_FOUNDATION_IDS.headquartersTenant}',
        '00000000-0000-4000-8000-000000000020',
        'BINANCE', 1, 'enc://encrypted', 'API_KEY',
        'http://127.0.0.1:13002/upstreams/binance', 'WEB', 15000
      )
    `)

    const [row] = (await queryRunner.query(`
      SELECT merchant."apiBaseUrl", merchant."pageSize", merchant."overlapSeconds",
        merchant."orderStatusList", credential."authMode",
        credential."apiBaseUrl" AS "credentialBaseUrl"
      FROM merchant
      JOIN merchant_platform_credential credential ON credential."merchantId" = merchant.id
    `)) as Array<Record<string, unknown>>
    expect(row).toMatchObject({
      apiBaseUrl: 'http://127.0.0.1:13002/upstreams/binance',
      pageSize: 20,
      overlapSeconds: 120,
      orderStatusList: [1],
      authMode: 'API_KEY',
      credentialBaseUrl: 'http://127.0.0.1:13002/upstreams/binance',
    })
  })
})
