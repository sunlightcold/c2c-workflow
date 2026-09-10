/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Merchant orders database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `merchant_order_test_${process.pid}_${Date.now()}`
  const merchantId = '00000000-0000-4000-8000-000000000020'
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
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    await migrateC2cMerchantOrders(queryRunner.manager)
    await migrateC2cMerchantOrders(queryRunner.manager)
    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform)
      VALUES ('${merchantId}', '${C2C_FOUNDATION_IDS.headquartersTenant}', 'm1', 'M1', 'BINANCE')
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

  it('stores a buy order, its initial history and one merchant checkpoint', async () => {
    const [order] = (await queryRunner.query(
      `INSERT INTO merchant_order (
        "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
        asset, "assetAmount", "fiatCurrency", "fiatAmount", "platformCreatedAt", "lastSyncedAt"
      ) VALUES ($1, $2, 'BINANCE', 'BIN-1', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT',
        'USDT', 10, 'CNY', 70, now(), now()) RETURNING id`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
    )) as Array<{ id: string }>
    await queryRunner.query(
      `INSERT INTO merchant_order_status_history (
        "tenantId", "merchantId", "merchantOrderId", "fromStatus", "toStatus", source, "platformStatus"
      ) VALUES ($1, $2, $3, NULL, 'PENDING_PAYMENT', 'PLATFORM_SYNC', 'PENDING_PAYMENT')`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id],
    )
    await queryRunner.query(
      `INSERT INTO merchant_order_sync_checkpoint ("tenantId", "merchantId", "nextSyncAt")
       VALUES ($1, $2, now())`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
    )
    const [{ orderCount, historyCount, checkpointCount }] = (await queryRunner.query(`
      SELECT
        (SELECT COUNT(*)::text FROM merchant_order) AS "orderCount",
        (SELECT COUNT(*)::text FROM merchant_order_status_history) AS "historyCount",
        (SELECT COUNT(*)::text FROM merchant_order_sync_checkpoint) AS "checkpointCount"
    `)) as Array<{ orderCount: string; historyCount: string; checkpointCount: string }>
    expect({ orderCount, historyCount, checkpointCount }).toEqual({
      orderCount: '1',
      historyCount: '1',
      checkpointCount: '1',
    })
  })

  it('rejects sell orders until the sell workflow is explicitly migrated', async () => {
    await queryRunner.query('SAVEPOINT before_sell')
    await expect(
      queryRunner.query(
        `INSERT INTO merchant_order (
          "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
          asset, "assetAmount", "fiatCurrency", "fiatAmount", "platformCreatedAt", "lastSyncedAt"
        ) VALUES ($1, $2, 'BINANCE', 'BIN-SELL-1', 'SELL', 'PENDING', 'NEW',
          'USDT', 10, 'CNY', 70, now(), now())`,
        [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
      ),
    ).rejects.toMatchObject({ code: '23514' })
    await queryRunner.query('ROLLBACK TO SAVEPOINT before_sell')
  })

  it('rejects an order whose platform differs from its merchant', async () => {
    await queryRunner.query('SAVEPOINT before_platform_mismatch')
    await expect(
      queryRunner.query(
        `INSERT INTO merchant_order (
          "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
          asset, "assetAmount", "fiatCurrency", "fiatAmount", "platformCreatedAt", "lastSyncedAt"
        ) VALUES ($1, $2, 'OKX', 'OKX-1', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT',
          'USDT', 10, 'CNY', 70, now(), now())`,
        [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
      ),
    ).rejects.toMatchObject({ code: '23503' })
    await queryRunner.query('ROLLBACK TO SAVEPOINT before_platform_mismatch')
  })
})
