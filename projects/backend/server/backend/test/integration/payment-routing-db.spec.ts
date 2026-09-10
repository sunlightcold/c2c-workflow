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
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentPlatformEntity,
  PaymentSourceType,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { PaymentOrderService } from '@/apps/admin/modules/payment/payment-order.service'
import { PaymentPlanResolver } from '@/apps/admin/modules/payment/payment-plan-resolver'
import { PaymentConfigService } from '@/apps/admin/modules/business/payment-config.service'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Payment routing database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `payment_routing_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000201'
  const instantAccountId = '00000000-0000-4000-8000-000000000202'
  const batchAccountId = '00000000-0000-4000-8000-000000000203'
  const instantAccountChannelId = '00000000-0000-4000-8000-000000000204'
  const batchAccountChannelId = '00000000-0000-4000-8000-000000000205'
  let adminDataSource: DataSource
  let dataSource: DataSource
  let resolver: PaymentPlanResolver
  let orders: PaymentOrderService
  let paymentConfig: PaymentConfigService

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
        PaymentOrderStatusHistoryEntity,
        PaymentBatchEntity,
        PaymentBatchItemEntity,
        PaymentBatchStatusHistoryEntity,
      ],
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await migrateC2cBusinessFoundation(dataSource.manager)
    await migrateC2cPaymentOrders(dataSource.manager)
    await migrateC2cPaymentRouting(dataSource.manager)
    await migrateC2cPaymentRouting(dataSource.manager)
    await migrateC2cMerchantPlatformCredentials(dataSource.manager)
    await migrateC2cMerchantAccountOperations(dataSource.manager)
    await migrateC2cPaymentBatches(dataSource.manager)
    await seedConfiguration()
    resolver = new PaymentPlanResolver(dataSource)
    orders = new PaymentOrderService(
      dataSource.getRepository(PaymentOrderEntity),
      dataSource.getRepository(MerchantEntity),
      resolver,
      dataSource,
    )
    paymentConfig = new PaymentConfigService(
      dataSource.getRepository(MerchantEntity),
      dataSource.getRepository(PaymentAccountEntity),
      dataSource.getRepository(PaymentAccountChannelEntity),
      dataSource.getRepository(MerchantPaymentPlanEntity),
      dataSource.getRepository(PaymentPlatformEntity),
      dataSource.getRepository(PaymentChannelEntity),
    )
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('migrates payment orders to support a pending-config route', async () => {
    const [columns, enumValues] = await Promise.all([
      dataSource.query<Array<{ column_name: string; is_nullable: string }>>(
        `SELECT column_name, is_nullable FROM information_schema.columns
         WHERE table_schema = current_schema() AND table_name = 'payment_order'
           AND column_name = ANY($1) ORDER BY column_name`,
        [['paymentAccountChannelId', 'paymentAccountId', 'paymentPlanId']],
      ),
      dataSource.query<Array<{ enumlabel: string }>>(
        `SELECT enumlabel FROM pg_enum WHERE enumtypid = 'payment_order_status_enum'::regtype`,
      ),
    ])
    expect(columns).toEqual([
      { column_name: 'paymentAccountChannelId', is_nullable: 'YES' },
      { column_name: 'paymentAccountId', is_nullable: 'YES' },
      { column_name: 'paymentPlanId', is_nullable: 'YES' },
    ])
    expect(enumValues).toContainEqual({ enumlabel: 'PENDING_CONFIG' })
  })

  it('matches amount, payment method and execution mode before selecting a route', async () => {
    await expect(
      resolver.resolve({
        tenantId,
        merchantId,
        scene: 'C2C_BUY',
        currency: 'CNY',
        amount: '100.00',
        paymentMethod: 'ALIPAY',
        executionMode: PaymentExecutionMode.INSTANT,
        routingKey: 'C2C_BUY:platform-1',
      }),
    ).resolves.toMatchObject({
      paymentAccountId: instantAccountId,
      paymentAccountChannelId: instantAccountChannelId,
      executionMode: PaymentExecutionMode.INSTANT,
    })
    await expect(
      resolver.resolve({
        tenantId,
        merchantId,
        scene: 'C2C_BUY',
        currency: 'CNY',
        amount: '501.00',
        paymentMethod: 'ALIPAY',
        executionMode: PaymentExecutionMode.INSTANT,
        routingKey: 'C2C_BUY:platform-2',
      }),
    ).resolves.toBeNull()
  })

  it('returns tenant-scoped payment accounts and plans without secret references', async () => {
    const accounts = await paymentConfig.listAccounts(tenantId)
    const plans = await paymentConfig.listPlans(tenantId, merchantId)

    expect(accounts).toHaveLength(2)
    expect(accounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: instantAccountId,
          tenantId,
          credentialConfigured: true,
          channels: [
            expect.objectContaining({
              id: instantAccountChannelId,
              channelCode: 'ALIPAY_MERCHANT_TRANSFER',
            }),
          ],
        }),
      ]),
    )
    for (const account of accounts) {
      expect(account).not.toHaveProperty('credentialRef')
      for (const channel of account.channels) expect(channel).not.toHaveProperty('configRef')
    }
    expect(plans).toHaveLength(2)
    await expect(
      paymentConfig.listAccounts('00000000-0000-4000-8000-000000000999'),
    ).resolves.toEqual([])
    await expect(paymentConfig.listPlans('00000000-0000-4000-8000-000000000999')).resolves.toEqual(
      [],
    )
  })

  it('creates one order when the same source is requested concurrently', async () => {
    const input = {
      merchantId,
      sourceType: PaymentSourceType.BOT_MANUAL,
      sourceBusinessNo: 'manual-concurrent-1',
      amount: '88.00',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.BATCH,
      payeeIdentity: 'payee@example.com',
      payeeName: 'Payee',
    }
    const results = await Promise.all([
      orders.create(tenantId, input),
      orders.create(tenantId, input),
    ])

    expect(results[0].id).toBe(results[1].id)
    expect(results[0]).toMatchObject({
      status: PaymentOrderStatus.READY,
      paymentAccountId: batchAccountId,
      paymentAccountChannelId: batchAccountChannelId,
    })
    await expect(
      dataSource.query(
        `SELECT COUNT(*)::text AS count FROM payment_order
         WHERE "tenantId" = $1 AND "merchantId" = $2 AND "sourceType" = $3
           AND "sourceBusinessNo" = $4`,
        [tenantId, merchantId, PaymentSourceType.BOT_MANUAL, input.sourceBusinessNo],
      ),
    ).resolves.toEqual([{ count: '1' }])
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus" FROM payment_order_status_history
         WHERE "paymentOrderId" = $1`,
        [results[0].id],
      ),
    ).resolves.toEqual([{ fromStatus: null, toStatus: 'READY' }])
  })

  it('lists and reads only payment orders from the requested tenant', async () => {
    const created = await orders.create(tenantId, {
      merchantId,
      sourceType: PaymentSourceType.BOT_MANUAL,
      sourceBusinessNo: 'manual-query-1',
      amount: '88.00',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.BATCH,
      payeeIdentity: 'payee@example.com',
      payeeName: 'Payee',
    })

    const listed = await orders.list(tenantId, {
      page: 1,
      pageSize: 20,
      status: PaymentOrderStatus.READY,
    })
    expect(listed.items).toContainEqual(expect.objectContaining({ id: created.id, tenantId }))
    expect(listed.total).toBe(listed.items.length)
    await expect(
      orders.list('00000000-0000-4000-8000-000000000999', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ items: [], total: 0 })
    await expect(orders.detail(tenantId, created.id)).resolves.toMatchObject({
      id: created.id,
      history: [expect.objectContaining({ toStatus: PaymentOrderStatus.READY })],
      batchItems: [],
    })
    await expect(orders.detail('00000000-0000-4000-8000-000000000999', created.id)).rejects.toThrow(
      '支付订单不存在',
    )
  })

  it('records one transition when a pending-config order is rematched', async () => {
    const order = await orders.create(tenantId, {
      merchantId,
      sourceType: PaymentSourceType.BOT_MANUAL,
      sourceBusinessNo: 'pending-config-1',
      amount: '8.00',
      currency: 'CNY',
      paymentMethod: 'ALIPAY',
      executionMode: PaymentExecutionMode.BATCH,
      payeeIdentity: 'payee@example.com',
      payeeName: 'Payee',
    })
    expect(order.status).toBe(PaymentOrderStatus.PENDING_CONFIG)
    await dataSource.query(
      `UPDATE payment_account_channel SET "minimumAmount" = 1.00 WHERE id = $1`,
      [batchAccountChannelId],
    )

    const results = await Promise.allSettled([
      orders.rematch(tenantId, order.id),
      orders.rematch(tenantId, order.id),
    ])

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus" FROM payment_order_status_history
         WHERE "paymentOrderId" = $1 ORDER BY "createdAt"`,
        [order.id],
      ),
    ).resolves.toEqual([
      { fromStatus: null, toStatus: 'PENDING_CONFIG' },
      { fromStatus: 'PENDING_CONFIG', toStatus: 'READY' },
    ])
  })

  async function seedConfiguration() {
    await dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO merchant (id, "tenantId", code, name, platform, "apiBaseUrl")
         VALUES ($1, $2, 'merchant-routing', 'Merchant Routing', 'BINANCE',
                 'https://api.binance.com')`,
        [merchantId, tenantId],
      )
      await manager.query(
        `INSERT INTO payment_account
           (id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef")
         VALUES
           ($1, $3, $4, 'instant', 'Instant', '2088001', 'secret://instant'),
           ($2, $3, $4, 'batch', 'Batch', '2088002', 'secret://batch')`,
        [instantAccountId, batchAccountId, tenantId, C2C_FOUNDATION_IDS.alipayPlatform],
      )
      await manager.query(
        `INSERT INTO payment_account_channel
           (id, "paymentAccountId", "channelId", "minimumAmount", "maximumAmount")
         VALUES
           ($1, $3, $5, 10.00, 500.00),
           ($2, $4, $6, 10.00, 1000.00)`,
        [
          instantAccountChannelId,
          batchAccountChannelId,
          instantAccountId,
          batchAccountId,
          C2C_FOUNDATION_IDS.alipayMerchantTransferChannel,
          C2C_FOUNDATION_IDS.alipayBatchChannel,
        ],
      )
      await manager.query(
        `INSERT INTO merchant_payment_plan
           ("tenantId", "merchantId", scene, currency, "paymentAccountId",
            "paymentAccountChannelId", priority, weight)
         VALUES
           ($1, $2, 'C2C_BUY', 'CNY', $3, $5, 10, 100),
           ($1, $2, 'BOT_MANUAL', 'CNY', $4, $6, 10, 100)`,
        [
          tenantId,
          merchantId,
          instantAccountId,
          batchAccountId,
          instantAccountChannelId,
          batchAccountChannelId,
        ],
      )
    })
  }
})
