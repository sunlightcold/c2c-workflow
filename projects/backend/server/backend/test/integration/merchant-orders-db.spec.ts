/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { DataSource, type QueryRunner } from 'typeorm'
import { TypeOrmC2cOrderSyncStore } from '@/apps/admin/modules/c2c-order/typeorm-c2c-order-sync.store'
import {
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
  MerchantPlatform,
} from '@/apps/admin/database'
import { C2cBuyOrderStatus } from '@/apps/admin/modules/c2c-platform'

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
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      entities: [
        MerchantOrderEntity,
        MerchantOrderStatusHistoryEntity,
        MerchantOrderSyncCheckpointEntity,
      ],
    })
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

  it('upserts a sync window with status history and does not advance success on failure', async () => {
    const storeDataSource: Pick<DataSource, 'transaction' | 'getRepository'> = {
      transaction: (work) => work(queryRunner.manager),
      getRepository: (entity) => queryRunner.manager.getRepository(entity),
    }
    const store = new TypeOrmC2cOrderSyncStore(storeDataSource)
    const firstAt = new Date('2026-09-10T05:00:00.000Z')
    const secondAt = new Date('2026-09-10T05:01:00.000Z')
    const base = {
      platformOrderId: 'BIN-STORE-1',
      side: 'BUY' as const,
      asset: 'USDT',
      assetAmount: '10',
      fiatCurrency: 'CNY',
      fiatAmount: '70',
      createdAt: '2026-09-10T04:50:00.000Z',
      platformPaymentMethodId: '2',
      paymentMethod: 'ALIPAY',
      payeeIdentity: 'payee@example.com',
      payeeName: 'Zhang San',
      identityName: 'Zhang San',
      payable: true,
      paymentDeadline: '2026-09-10T05:10:00.000Z',
    }
    await expect(
      store.persistWindow(
        {
          tenantId: C2C_FOUNDATION_IDS.headquartersTenant,
          merchantId,
          platform: MerchantPlatform.BINANCE,
        },
        [{ ...base, status: C2cBuyOrderStatus.PENDING_PAYMENT }],
        firstAt,
      ),
    ).resolves.toEqual({ created: 1, updated: 0 })
    await expect(
      store.persistWindow(
        {
          tenantId: C2C_FOUNDATION_IDS.headquartersTenant,
          merchantId,
          platform: MerchantPlatform.BINANCE,
        },
        [{ ...base, status: C2cBuyOrderStatus.COMPLETED, payable: false }],
        secondAt,
      ),
    ).resolves.toEqual({ created: 0, updated: 1 })
    await store.recordFailure(
      C2C_FOUNDATION_IDS.headquartersTenant,
      merchantId,
      new Date('2026-09-10T05:02:00.000Z'),
      'upstream unavailable',
    )

    const [state] = (await queryRunner.query(
      `SELECT
        (SELECT COUNT(*)::text FROM merchant_order WHERE "platformOrderId" = 'BIN-STORE-1') AS "orderCount",
        (SELECT COUNT(*)::text FROM merchant_order_status_history h
          JOIN merchant_order o ON o.id = h."merchantOrderId"
          WHERE o."platformOrderId" = 'BIN-STORE-1') AS "historyCount",
        (SELECT "lastSuccessAt" FROM merchant_order_sync_checkpoint
          WHERE "tenantId" = $1 AND "merchantId" = $2) AS "lastSuccessAt"`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
    )) as Array<{ orderCount: string; historyCount: string; lastSuccessAt: Date }>
    expect(state.orderCount).toBe('1')
    expect(state.historyCount).toBe('2')
    expect(state.lastSuccessAt.toISOString()).toBe(secondAt.toISOString())
  })
})
