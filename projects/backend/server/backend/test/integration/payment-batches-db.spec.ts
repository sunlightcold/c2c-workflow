/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchStatusHistoryEntity,
  PaymentChannelEntity,
  PaymentOrderEntity,
  PaymentPlatformEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { PaymentBatchService } from '@/apps/admin/modules/payment/payment-batch.service'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Payment batch migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `payment_batch_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000201'
  const accountId = '00000000-0000-4000-8000-000000000202'
  const accountChannelId = '00000000-0000-4000-8000-000000000203'
  const planId = '00000000-0000-4000-8000-000000000204'
  const orderId = '00000000-0000-4000-8000-000000000205'
  let adminDataSource: DataSource
  let dataSource: DataSource
  let service: PaymentBatchService

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
      entities: [
        MerchantEntity,
        MerchantPaymentPlanEntity,
        PaymentAccountEntity,
        PaymentAccountChannelEntity,
        PaymentPlatformEntity,
        PaymentChannelEntity,
        PaymentOrderEntity,
        PaymentBatchEntity,
        PaymentBatchItemEntity,
        PaymentBatchStatusHistoryEntity,
      ],
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await dataSource.transaction(async (manager) => {
      await migrateC2cBusinessFoundation(manager)
      await migrateC2cPaymentOrders(manager)
      await migrateC2cPaymentRouting(manager)
      await migrateC2cMerchantPlatformCredentials(manager)
      await migrateC2cPaymentBatches(manager)
      await manager.query(
        `INSERT INTO merchant (id, "tenantId", code, name, platform)
         VALUES ($1, $2, 'merchant-1', 'Merchant 1', 'BINANCE')`,
        [merchantId, tenantId],
      )
      await manager.query(
        `INSERT INTO payment_account
           (id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef")
         VALUES ($1, $2, $3, 'account-1', 'Account 1', '2088', 'secret://alipay/account-1')`,
        [accountId, tenantId, C2C_FOUNDATION_IDS.alipayPlatform],
      )
      await manager.query(
        `INSERT INTO payment_account_channel
           (id, "paymentAccountId", "channelId", "concurrencyLimit")
         VALUES ($1, $2, $3, 1)`,
        [accountChannelId, accountId, C2C_FOUNDATION_IDS.alipayBatchChannel],
      )
      await manager.query(
        `INSERT INTO merchant_payment_plan
           (id, "tenantId", "merchantId", scene, currency, "paymentAccountId", "paymentAccountChannelId")
         VALUES ($1, $2, $3, 'BOT_MANUAL', 'CNY', $4, $5)`,
        [planId, tenantId, merchantId, accountId, accountChannelId],
      )
      await manager.query(
        `INSERT INTO payment_order
           (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo", amount,
            currency, "paymentMethod", "executionMode", "payeeIdentity", "payeeName",
            "paymentPlanId", "paymentAccountId", "paymentAccountChannelId", status)
         VALUES ($1, $2, $3, 'BOT_MANUAL', 'source-1', 'PAY-1', 100.00, 'CNY', 'ALIPAY', 'BATCH',
                 'payee@example.com', 'Payee', $4, $5, $6, 'READY')`,
        [orderId, tenantId, merchantId, planId, accountId, accountChannelId],
      )
    })
    service = new PaymentBatchService(dataSource)
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM payment_batch_status_history')
    await dataSource.query('DELETE FROM payment_batch_item')
    await dataSource.query('DELETE FROM payment_batch')
    await dataSource.query(`UPDATE payment_order SET status = 'READY', "executionMode" = 'BATCH'`)
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('creates batch tables and prevents one payment order from joining two active batches', async () => {
    const [{ tableCount }] = (await dataSource.query(
      `SELECT COUNT(*)::text AS "tableCount"
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name IN ('payment_batch', 'payment_batch_item', 'payment_batch_status_history')`,
    )) as Array<{ tableCount: string }>
    expect(tableCount).toBe('3')

    const firstBatchId = await insertBatch('BAT-1')
    await insertItem(firstBatchId)
    const secondBatchId = await insertBatch('BAT-2')
    await expect(insertItem(secondBatchId)).rejects.toMatchObject({
      driverError: { code: '23505' },
    })

    await dataSource.query(`UPDATE payment_batch_item SET status = 'FAILED' WHERE "batchId" = $1`, [
      firstBatchId,
    ])
    await expect(insertItem(secondBatchId)).resolves.toBeDefined()
  })

  it('creates a ready batch from compatible payment orders and records its initial state', async () => {
    const result = await service.create(tenantId, [orderId])

    expect(result.batch).toMatchObject({
      tenantId,
      merchantId,
      paymentAccountId: accountId,
      paymentAccountChannelId: accountChannelId,
      currency: 'CNY',
      totalCount: 1,
      totalAmount: '100.00',
      status: 'READY',
    })
    expect(result.items).toEqual([
      expect.objectContaining({ paymentOrderId: orderId, amount: '100.00', status: 'QUEUED' }),
    ])
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus" FROM payment_batch_status_history WHERE "batchId" = $1`,
        [result.batch.id],
      ),
    ).resolves.toEqual([{ fromStatus: null, toStatus: 'READY' }])
  })

  it('rejects orders that are not routed to batch execution', async () => {
    await dataSource.query(`UPDATE payment_order SET "executionMode" = 'INSTANT' WHERE id = $1`, [
      orderId,
    ])

    await expect(service.create(tenantId, [orderId])).rejects.toThrow(
      '只能组批待提交的支付宝批量支付订单',
    )
  })

  async function insertBatch(batchNo: string): Promise<string> {
    const [{ id }] = (await dataSource.query(
      `INSERT INTO payment_batch
         ("tenantId", "merchantId", "batchNo", "paymentAccountId", "paymentAccountChannelId",
          currency, "totalCount", "totalAmount", status)
       VALUES ($1, $2, $3, $4, $5, 'CNY', 1, 100.00, 'READY') RETURNING id`,
      [tenantId, merchantId, batchNo, accountId, accountChannelId],
    )) as Array<{ id: string }>
    return id
  }

  function insertItem(batchId: string) {
    return dataSource.query(
      `INSERT INTO payment_batch_item
         ("tenantId", "merchantId", "batchId", "paymentOrderId", amount, status)
       VALUES ($1, $2, $3, $4, 100.00, 'QUEUED')`,
      [tenantId, merchantId, batchId, orderId],
    )
  }
})
