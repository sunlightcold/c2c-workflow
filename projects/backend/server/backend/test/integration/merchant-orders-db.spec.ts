/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cFullProviderParity } from '@/apps/admin/database/migrations/c2c-full-provider-parity.migration'
import { migrateC2cTelegramReviewNotifications } from '@/apps/admin/database/migrations/c2c-telegram-review-notifications.migration'
import { DataSource, type QueryRunner } from 'typeorm'
import { TypeOrmC2cOrderSyncStore } from '@/apps/admin/modules/c2c-order/typeorm-c2c-order-sync.store'
import { TypeOrmC2cOrderAppealStore } from '@/apps/admin/modules/c2c-order/typeorm-c2c-order-appeal.store'
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
    await migrateC2cMerchantAccountOperations(queryRunner.manager)
    await migrateC2cMerchantOrderAppeals(queryRunner.manager)
    await migrateC2cMerchantOrderAppeals(queryRunner.manager)
    await migrateC2cFullProviderParity(queryRunner.manager)
    await migrateC2cTelegramReviewNotifications(queryRunner.manager)
    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform, "apiBaseUrl")
      VALUES (
        '${merchantId}', '${C2C_FOUNDATION_IDS.headquartersTenant}', 'm1', 'M1', 'BINANCE',
        'https://api.binance.com'
      )
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

  it('migrates every merchant order appeal field', async () => {
    const columns = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = $1
         AND table_name = 'merchant_order'
         AND column_name = ANY($2)
       ORDER BY column_name`,
      [
        schema,
        [
          'appealStatus',
          'appealReasonCode',
          'appealReason',
          'appealComplaintNo',
          'appealClaimedAt',
          'appealSubmittedAt',
          'appealLastError',
        ],
      ],
    )) as Array<{ column_name: string }>

    expect(columns.map(({ column_name }) => column_name)).toEqual([
      'appealClaimedAt',
      'appealComplaintNo',
      'appealLastError',
      'appealReason',
      'appealReasonCode',
      'appealStatus',
      'appealSubmittedAt',
    ])
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

  it('claims a due merchant with its tenant and merchant scope', async () => {
    await queryRunner.query(
      `INSERT INTO merchant_order_sync_checkpoint (
        "tenantId", "merchantId", "nextSyncAt", "consecutiveFailures"
      ) VALUES ($1, $2, $3, 0)
      ON CONFLICT ("tenantId", "merchantId") DO UPDATE
      SET "nextSyncAt" = EXCLUDED."nextSyncAt",
          "leaseOwner" = NULL,
          "leaseExpiresAt" = NULL`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId, new Date('2026-09-13T00:00:00Z')],
    )
    const storeDataSource: Pick<DataSource, 'transaction' | 'getRepository' | 'query'> = {
      transaction: (work) => work(queryRunner.manager),
      getRepository: dataSource.getRepository.bind(dataSource),
      query: queryRunner.query.bind(queryRunner),
    }
    const store = new TypeOrmC2cOrderSyncStore(storeDataSource)

    await expect(
      store.claimDue('integration-worker', new Date('2026-09-13T00:01:00Z'), 1, 120_000),
    ).resolves.toEqual([
      {
        tenantId: C2C_FOUNDATION_IDS.headquartersTenant,
        merchantId,
      },
    ])
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
    const storeDataSource: Pick<DataSource, 'transaction' | 'getRepository' | 'query'> = {
      transaction: (work) => work(queryRunner.manager),
      getRepository: (entity) => queryRunner.manager.getRepository(entity),
      query: queryRunner.query.bind(queryRunner),
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

  it('claims one appeal atomically and preserves uncertain submissions against retries', async () => {
    const [order] = (await queryRunner.query(
      `INSERT INTO merchant_order (
        "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
        asset, "assetAmount", "fiatCurrency", "fiatAmount", "platformCreatedAt", "lastSyncedAt"
      ) VALUES ($1, $2, 'BINANCE', 'BIN-APPEAL-1', 'BUY', 'PAID', 'PENDING_RELEASE',
        'USDT', 10, 'CNY', 70, now(), now()) RETURNING id`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
    )) as Array<{ id: string }>
    const store = new TypeOrmC2cOrderAppealStore({
      getRepository: (entity) => queryRunner.manager.getRepository(entity),
    })

    await expect(
      store.claim(C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id),
    ).resolves.toBe('CLAIMED')
    await expect(
      store.claim(C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id),
    ).resolves.toBe('PROCESSING')
    await store.setReason(
      C2C_FOUNDATION_IDS.headquartersTenant,
      merchantId,
      order.id,
      6,
      '卖家收款后未放行',
    )
    await store.markSubmissionUncertain(
      C2C_FOUNDATION_IDS.headquartersTenant,
      merchantId,
      order.id,
      'upstream timeout',
    )
    const [processing] = (await queryRunner.query(
      `SELECT "appealStatus", "appealReasonCode", "appealReason", "appealLastError"
       FROM merchant_order WHERE id = $1`,
      [order.id],
    )) as Array<Record<string, unknown>>
    expect(processing).toMatchObject({
      appealStatus: 'PROCESSING',
      appealReasonCode: 6,
      appealReason: '卖家收款后未放行',
      appealLastError: 'upstream timeout',
    })

    await store.markSubmitted(
      C2C_FOUNDATION_IDS.headquartersTenant,
      merchantId,
      order.id,
      '30006788',
    )
    await expect(
      store.claim(C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id),
    ).resolves.toBe('SUBMITTED')
    await expect(
      store.claim('00000000-0000-4000-8000-000000000099', merchantId, order.id),
    ).rejects.toThrow('商家订单不存在')
  })

  it('releases a claim before submission so an operator can retry', async () => {
    const [order] = (await queryRunner.query(
      `INSERT INTO merchant_order (
        "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
        asset, "assetAmount", "fiatCurrency", "fiatAmount", "platformCreatedAt", "lastSyncedAt"
      ) VALUES ($1, $2, 'BINANCE', 'BIN-APPEAL-2', 'BUY', 'PAID', 'PENDING_RELEASE',
        'USDT', 10, 'CNY', 70, now(), now()) RETURNING id`,
      [C2C_FOUNDATION_IDS.headquartersTenant, merchantId],
    )) as Array<{ id: string }>
    const store = new TypeOrmC2cOrderAppealStore({
      getRepository: (entity) => queryRunner.manager.getRepository(entity),
    })

    await store.claim(C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id)
    await store.releaseClaim(
      C2C_FOUNDATION_IDS.headquartersTenant,
      merchantId,
      order.id,
      'receipt upload failed',
    )
    const [released] = (await queryRunner.query(
      `SELECT "appealStatus", "appealClaimedAt", "appealLastError"
       FROM merchant_order WHERE id = $1`,
      [order.id],
    )) as Array<Record<string, unknown>>
    expect(released).toMatchObject({
      appealStatus: null,
      appealClaimedAt: null,
      appealLastError: 'receipt upload failed',
    })
    await expect(
      store.claim(C2C_FOUNDATION_IDS.headquartersTenant, merchantId, order.id),
    ).resolves.toBe('CLAIMED')
  })
})
