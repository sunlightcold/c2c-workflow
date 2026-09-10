/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchStatusHistoryEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { PaymentOrderState } from '@/apps/admin/modules/payment/payment-order-state-machine'
import { PaymentOrderService } from '@/apps/admin/modules/payment/payment-order.service'
import { C2cPaymentCancellationService } from '@/apps/admin/modules/payment/c2c-payment-cancellation.service'
import { TypeOrmPaymentOrderStore } from '@/apps/admin/modules/payment/typeorm-payment-order.store'
import developmentConfig from '@/config/development'
import { ConflictException } from '@nestjs/common'
import { DataSource } from 'typeorm'

describe('Payment order store database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `payment_order_store_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000101'
  const accountId = '00000000-0000-4000-8000-000000000102'
  const accountChannelId = '00000000-0000-4000-8000-000000000103'
  const planId = '00000000-0000-4000-8000-000000000104'
  const orderId = '00000000-0000-4000-8000-000000000105'
  let adminDataSource: DataSource
  let dataSource: DataSource
  let store: TypeOrmPaymentOrderStore
  let paymentOrders: PaymentOrderService
  let cancellation: C2cPaymentCancellationService

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
        MerchantOrderEntity,
        MerchantOrderStatusHistoryEntity,
        PaymentOrderEntity,
        PaymentOrderStatusHistoryEntity,
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
      await migrateC2cMerchantAccountOperations(manager)
      await migrateC2cMerchantOrders(manager)
      await migrateC2cMerchantOrderAppeals(manager)
      await migrateC2cPaymentBatches(manager)
      await manager.query(
        `INSERT INTO merchant (id, "tenantId", code, name, platform, "apiBaseUrl")
         VALUES ($1, $2, 'merchant-1', 'Merchant 1', 'BINANCE', 'http://127.0.0.1:13002')`,
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
        [accountChannelId, accountId, C2C_FOUNDATION_IDS.alipayMerchantTransferChannel],
      )
      await manager.query(
        `INSERT INTO merchant_payment_plan
           (id, "tenantId", "merchantId", scene, currency, "paymentAccountId", "paymentAccountChannelId")
         VALUES ($1, $2, $3, 'C2C_BUY', 'CNY', $4, $5)`,
        [planId, tenantId, merchantId, accountId, accountChannelId],
      )
    })
    store = new TypeOrmPaymentOrderStore(dataSource)
    paymentOrders = new PaymentOrderService(
      dataSource.getRepository(PaymentOrderEntity),
      dataSource.getRepository(MerchantEntity),
      { resolve: jest.fn() },
      dataSource,
    )
    cancellation = new C2cPaymentCancellationService(dataSource)
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM payment_batch_status_history')
    await dataSource.query('DELETE FROM payment_batch_item')
    await dataSource.query('DELETE FROM payment_batch')
    await dataSource.query('DELETE FROM payment_order_status_history')
    await dataSource.query('DELETE FROM payment_order')
    await dataSource.query('DELETE FROM merchant_order_status_history')
    await dataSource.query('DELETE FROM merchant_order')
    await dataSource.query(
      `INSERT INTO merchant_order
         ("tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
          asset, "assetAmount", "fiatCurrency", "fiatAmount", "paymentMethod",
          "platformPaymentMethodId", "payeeIdentity", "payeeName", payable, "paymentDeadline",
          "platformCreatedAt", "lastSyncedAt")
       VALUES ($1, $2, 'BINANCE', 'source-1', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT',
               'USDT', 10, 'CNY', 100.00, 'ALIPAY', '901', 'payee@example.com', 'Payee', true,
               now() + interval '10 minutes', now(), now())`,
      [tenantId, merchantId],
    )
    await dataSource.query(
      `INSERT INTO payment_order
         (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo", amount,
          currency, "payeeIdentity", "payeeName", "paymentPlanId", "paymentAccountId",
          "paymentAccountChannelId", status)
       VALUES ($1, $2, $3, 'C2C_BUY', 'source-1', 'PAY-1', 100.00, 'CNY', 'payee@example.com',
               'Payee', $4, $5, $6, 'READY')`,
      [orderId, tenantId, merchantId, planId, accountId, accountChannelId],
    )
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('allows only one concurrent worker to claim a ready order and records one history row', async () => {
    const results = await Promise.allSettled([
      store.claim(tenantId, orderId),
      store.claim(tenantId, orderId),
    ])

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(({ status }) => status === 'rejected')
    expect(rejected).toMatchObject({ reason: expect.any(ConflictException) })
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus" FROM payment_order_status_history WHERE "paymentOrderId" = $1`,
        [orderId],
      ),
    ).resolves.toEqual([{ fromStatus: 'READY', toStatus: 'SUBMITTING' }])
    await expect(
      dataSource.query(`SELECT status FROM merchant_order WHERE "platformOrderId" = 'source-1'`),
    ).resolves.toEqual([{ status: 'PAYMENT_PROCESSING' }])
  })

  it('scopes claims by tenant and does not change the order on a cross-tenant request', async () => {
    await expect(
      store.claim('00000000-0000-4000-8000-000000000999', orderId),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      dataSource.query('SELECT status FROM payment_order WHERE id = $1', [orderId]),
    ).resolves.toEqual([{ status: PaymentOrderStatus.READY }])
  })

  it('clears a previous error after a successful recovery transition', async () => {
    await dataSource.query(
      `UPDATE payment_order SET status = 'UNKNOWN', "lastError" = 'timeout' WHERE id = $1`,
      [orderId],
    )
    await store.transition(
      { id: orderId, tenantId, status: PaymentOrderState.UNKNOWN },
      PaymentOrderState.SUCCESS,
    )

    await expect(
      dataSource.query('SELECT status, "lastError" FROM payment_order WHERE id = $1', [orderId]),
    ).resolves.toEqual([{ status: 'SUCCESS', lastError: null }])
  })

  it('restores the merchant order when payment was definitely not submitted', async () => {
    const claimed = await store.claim(tenantId, orderId)
    await store.transition(claimed, PaymentOrderState.FAILED, {
      errorMessage: '平台订单已过期',
    })

    await expect(
      dataSource.query(
        `SELECT status, "lastError" FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
      ),
    ).resolves.toEqual([{ status: 'PENDING_PAYMENT', lastError: '平台订单已过期' }])
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus" FROM merchant_order_status_history
         ORDER BY "createdAt"`,
      ),
    ).resolves.toEqual([
      { fromStatus: 'PENDING_PAYMENT', toStatus: 'PAYMENT_PROCESSING' },
      { fromStatus: 'PAYMENT_PROCESSING', toStatus: 'PENDING_PAYMENT' },
    ])
  })

  it('restores the merchant order when reconciliation proves the payment failed', async () => {
    const claimed = await store.claim(tenantId, orderId)
    const unknown = await store.transition(claimed, PaymentOrderState.UNKNOWN, {
      errorMessage: '支付结果暂时未知',
    })
    await store.transition(unknown, PaymentOrderState.FAILED, {
      errorMessage: '支付宝原单不存在',
    })

    await expect(
      dataSource.query(
        `SELECT status, "lastError" FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
      ),
    ).resolves.toEqual([{ status: 'PENDING_PAYMENT', lastError: '支付宝原单不存在' }])
  })

  it('cancels a merchant order and its ready payment in one transaction', async () => {
    const [{ id: merchantOrderId }] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
    )

    await cancellation.cancel(tenantId, {
      merchantId,
      merchantOrderId,
      operator: 'admin',
      reason: '收款资料有误',
      sourceBusinessNo: 'source-1',
    })

    await expect(
      dataSource.query(`SELECT status FROM merchant_order WHERE id = $1`, [merchantOrderId]),
    ).resolves.toEqual([{ status: 'CANCELLED' }])
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'CANCELLED' }])
    await expect(
      dataSource.query(
        `SELECT "toStatus", reason FROM payment_order_status_history WHERE "paymentOrderId" = $1`,
        [orderId],
      ),
    ).resolves.toEqual([{ toStatus: 'CANCELLED', reason: 'admin: 收款资料有误' }])
  })

  it('removes a queued payment from its unsubmitted batch before cancelling it', async () => {
    const [{ id: merchantOrderId }] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
    )
    const batchId = '00000000-0000-4000-8000-000000000106'
    await dataSource.query(
      `INSERT INTO payment_batch
         (id, "tenantId", "merchantId", "batchNo", "paymentAccountId",
          "paymentAccountChannelId", currency, "totalCount", "totalAmount", status)
       VALUES ($1, $2, $3, 'BATCH-CANCEL-1', $4, $5, 'CNY', 1, 100.00, 'READY')`,
      [batchId, tenantId, merchantId, accountId, accountChannelId],
    )
    await dataSource.query(
      `INSERT INTO payment_batch_item
         ("tenantId", "merchantId", "batchId", "paymentOrderId", amount, status)
       VALUES ($1, $2, $3, $4, 100.00, 'QUEUED')`,
      [tenantId, merchantId, batchId, orderId],
    )

    await cancellation.cancel(tenantId, {
      merchantId,
      merchantOrderId,
      operator: 'admin',
      reason: '订单无需继续',
      sourceBusinessNo: 'source-1',
    })

    await expect(
      dataSource.query(
        `SELECT status, "totalCount", "totalAmount"::text FROM payment_batch WHERE id = $1`,
        [batchId],
      ),
    ).resolves.toEqual([{ status: 'CANCELLED', totalCount: 1, totalAmount: '100.00' }])
    await expect(
      dataSource.query(`SELECT status FROM payment_batch_item WHERE "batchId" = $1`, [batchId]),
    ).resolves.toEqual([{ status: 'CANCELLED' }])
  })

  it('rejects cancellation after the funding request has been submitted', async () => {
    const [{ id: merchantOrderId }] = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
    )
    await dataSource.query(`UPDATE payment_order SET status = 'SUBMITTING' WHERE id = $1`, [
      orderId,
    ])
    await dataSource.query(
      `UPDATE merchant_order SET status = 'PAYMENT_PROCESSING' WHERE id = $1`,
      [merchantOrderId],
    )

    await expect(
      cancellation.cancel(tenantId, {
        merchantId,
        merchantOrderId,
        operator: 'admin',
        reason: '误操作',
        sourceBusinessNo: 'source-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'SUBMITTING' }])
  })

  it('rolls back payment creation when the merchant order was cancelled concurrently', async () => {
    await dataSource.query('DELETE FROM payment_order')
    await dataSource.query(
      `UPDATE merchant_order SET status = 'CANCELLED' WHERE "platformOrderId" = 'source-1'`,
    )

    await expect(
      paymentOrders.create(tenantId, {
        merchantId,
        sourceType: PaymentSourceType.C2C_BUY,
        sourceBusinessNo: 'source-1',
        amount: '100.00',
        currency: 'CNY',
        paymentMethod: 'ALIPAY',
        executionMode: PaymentExecutionMode.INSTANT,
        payeeIdentity: 'payee@example.com',
        payeeName: 'Payee',
      }),
    ).rejects.toBeInstanceOf(ConflictException)
    await expect(
      dataSource.query('SELECT COUNT(*)::integer AS count FROM payment_order'),
    ).resolves.toEqual([{ count: 0 }])
  })
})
