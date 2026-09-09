/// <reference types="jest" />

import {
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { PaymentOrderState } from '@/apps/admin/modules/payment/payment-order-state-machine'
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
      entities: [PaymentOrderEntity, PaymentOrderStatusHistoryEntity],
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await dataSource.transaction(async (manager) => {
      await migrateC2cBusinessFoundation(manager)
      await migrateC2cPaymentOrders(manager)
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
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM payment_order_status_history')
    await dataSource.query('DELETE FROM payment_order')
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
})
