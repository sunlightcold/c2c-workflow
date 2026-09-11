/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchStatus,
  PaymentBatchStatusHistoryEntity,
  PaymentChannelEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
  PaymentSourceType,
  PaymentPlatformEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migratePaymentAccountCredentials } from '@/apps/admin/database/migrations/payment-account-credentials.migration'
import { PaymentBatchService } from '@/apps/admin/modules/payment/payment-batch.service'
import { TypeOrmPaymentBatchStore } from '@/apps/admin/modules/payment/typeorm-payment-batch.store'
import { PaymentExecutionStatus } from '@/apps/admin/modules/payment/payment-adapter.types'
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
  let store: TypeOrmPaymentBatchStore

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
    await dataSource.transaction(async (manager) => {
      await migrateC2cBusinessFoundation(manager)
      await migratePaymentAccountCredentials(manager)
      await migrateC2cPaymentOrders(manager)
      await migrateC2cPaymentRouting(manager)
      await migrateC2cMerchantPlatformCredentials(manager)
      await migrateC2cMerchantOrders(manager)
      await migrateC2cMerchantOrderAppeals(manager)
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
    store = new TypeOrmPaymentBatchStore(dataSource)
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM payment_batch_status_history')
    await dataSource.query('DELETE FROM payment_batch_item')
    await dataSource.query('DELETE FROM payment_batch')
    await dataSource.query('DELETE FROM merchant_order_status_history')
    await dataSource.query('DELETE FROM merchant_order')
    await dataSource.query(
      `UPDATE payment_order
       SET status = 'READY', "executionMode" = 'BATCH', "sourceType" = 'BOT_MANUAL',
           "sourceBusinessNo" = 'source-1', "upstreamId" = NULL, "lastError" = NULL`,
    )
    await dataSource.query(`UPDATE payment_account SET status = 'active' WHERE id = $1`, [
      accountId,
    ])
    await dataSource.query(`UPDATE payment_account_channel SET status = 'active' WHERE id = $1`, [
      accountChannelId,
    ])
    await dataSource.query(`UPDATE payment_channel SET status = 'active' WHERE id = $1`, [
      C2C_FOUNDATION_IDS.alipayBatchChannel,
    ])
    await dataSource.query(`UPDATE payment_platform SET status = 'active' WHERE id = $1`, [
      C2C_FOUNDATION_IDS.alipayPlatform,
    ])
    await dataSource.query(`UPDATE merchant_payment_plan SET status = 'active' WHERE id = $1`, [
      planId,
    ])
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
      batchNo: expect.stringMatching(/^BAT\d{20}$/),
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

  it('offers only unbatched ready orders to automatic batch submission', async () => {
    await expect(
      service.findReadyGroups(tenantId, merchantId, PaymentSourceType.BOT_MANUAL),
    ).resolves.toEqual([{ paymentOrderIds: [orderId], totalAmount: '100.00' }])
    const created = await service.create(tenantId, [orderId])

    await expect(
      service.findReadyGroups(tenantId, merchantId, PaymentSourceType.BOT_MANUAL),
    ).resolves.toEqual([])
    await dataSource.query(`UPDATE payment_batch_item SET status = 'FAILED' WHERE "batchId" = $1`, [
      created.batch.id,
    ])
    await expect(
      service.findReadyGroups(tenantId, merchantId, PaymentSourceType.BOT_MANUAL),
    ).resolves.toEqual([{ paymentOrderIds: [orderId], totalAmount: '100.00' }])
  })

  it('lists and reads only payment batches from the requested tenant', async () => {
    const created = await service.create(tenantId, [orderId])

    await expect(
      service.list(tenantId, { page: 1, pageSize: 20, status: PaymentBatchStatus.READY }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: created.batch.id })],
      total: 1,
    })
    await expect(
      service.list('00000000-0000-4000-8000-000000000999', { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({ items: [], total: 0 })
    await expect(service.detail(tenantId, created.batch.id)).resolves.toMatchObject({
      batch: { id: created.batch.id },
      items: [expect.objectContaining({ paymentOrderId: orderId })],
    })
    await expect(
      service.detail('00000000-0000-4000-8000-000000000999', created.batch.id),
    ).rejects.toThrow('支付批次不存在')
  })

  it('rejects orders that are not routed to batch execution', async () => {
    await dataSource.query(`UPDATE payment_order SET "executionMode" = 'INSTANT' WHERE id = $1`, [
      orderId,
    ])

    await expect(service.create(tenantId, [orderId])).rejects.toThrow(
      '只能组批待提交的支付宝批量支付订单',
    )
  })

  it('claims the batch and all payment orders atomically before submission', async () => {
    const created = await service.create(tenantId, [orderId])
    const prepared = await store.prepare(tenantId, created.batch.id)

    await expect(store.claim(prepared)).resolves.toMatchObject({ status: 'SUBMITTING' })
    await expect(
      dataSource.query(`SELECT status FROM payment_batch_item WHERE "batchId" = $1`, [
        created.batch.id,
      ]),
    ).resolves.toEqual([{ status: 'SUBMITTING' }])
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'SUBMITTING' }])
  })

  it('rolls back the entire claim when the locked payment configuration becomes inactive', async () => {
    const created = await service.create(tenantId, [orderId])
    const prepared = await store.prepare(tenantId, created.batch.id)
    await dataSource.query(`UPDATE payment_account_channel SET status = 'disabled' WHERE id = $1`, [
      accountChannelId,
    ])

    await expect(store.claim(prepared)).rejects.toThrow('支付批次锁定的支付账号配置已失效')
    await expect(
      dataSource.query(`SELECT status FROM payment_batch WHERE id = $1`, [created.batch.id]),
    ).resolves.toEqual([{ status: 'READY' }])
    await expect(
      dataSource.query(`SELECT status FROM payment_batch_item WHERE "batchId" = $1`, [
        created.batch.id,
      ]),
    ).resolves.toEqual([{ status: 'QUEUED' }])
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'READY' }])
  })

  it('keeps aggregate counts accurate while a submitted batch becomes unknown or failed', async () => {
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    const processing = await store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      'ALI-BAT-1',
    )

    await expect(readBatchCounts(created.batch.id)).resolves.toEqual({
      successCount: 0,
      failedCount: 0,
      processingCount: 1,
      unknownCount: 0,
    })
    const unknown = await store.markUnknown(processing, 'query timed out')
    await expect(readBatchCounts(created.batch.id)).resolves.toEqual({
      successCount: 0,
      failedCount: 0,
      processingCount: 0,
      unknownCount: 1,
    })
    await store.fail(unknown, 'payment rejected')
    await expect(readBatchCounts(created.batch.id)).resolves.toEqual({
      successCount: 0,
      failedCount: 1,
      processingCount: 0,
      unknownCount: 0,
    })
  })

  it('allows an unknown submitted batch to use its original credentials after configuration stops', async () => {
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    await store.markUnknown(claimed, 'submission result unknown')
    await dataSource.query(`UPDATE payment_account SET status = 'disabled' WHERE id = $1`, [
      accountId,
    ])
    await dataSource.query(`UPDATE payment_account_channel SET status = 'disabled' WHERE id = $1`, [
      accountChannelId,
    ])
    await dataSource.query(`UPDATE payment_channel SET status = 'disabled' WHERE id = $1`, [
      C2C_FOUNDATION_IDS.alipayBatchChannel,
    ])
    await dataSource.query(`UPDATE payment_platform SET status = 'disabled' WHERE id = $1`, [
      C2C_FOUNDATION_IDS.alipayPlatform,
    ])
    await dataSource.query(`UPDATE merchant_payment_plan SET status = 'disabled' WHERE id = $1`, [
      planId,
    ])

    await expect(store.prepare(tenantId, created.batch.id)).resolves.toMatchObject({
      id: created.batch.id,
      status: 'UNKNOWN',
      credentialRef: 'secret://alipay/account-1',
    })
  })

  it('applies per-item query results and completes manual payments', async () => {
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    const processing = await store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      'ALI-BAT-1',
    )

    const outcome = await store.applyQuery(processing, {
      status: PaymentExecutionStatus.SUCCESS,
      upstreamId: 'ALI-BAT-1',
      raw: {
        code: '10000',
        outBatchNo: processing.batchNo,
        batchTransId: 'ALI-BAT-1',
        batchStatus: 'SUCCESS',
        accDetailList: [
          {
            outBizNo: 'PAY-1',
            detailId: 'DETAIL-1',
            alipayOrderNo: 'ALI-ORDER-1',
            status: 'SUCCESS',
            transAmount: '100.00',
          },
        ],
      },
    })

    expect(outcome).toMatchObject({
      batch: { status: 'SUCCESS' },
      paymentsToConfirm: [],
    })
    await expect(
      dataSource.query(
        `SELECT status, "successCount", "failedCount" FROM payment_batch WHERE id = $1`,
        [created.batch.id],
      ),
    ).resolves.toEqual([{ status: 'SUCCESS', successCount: 1, failedCount: 0 }])
    await expect(
      dataSource.query(`SELECT status, "upstreamId" FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'COMPLETED', upstreamId: 'ALI-ORDER-1' }])
  })

  it('keeps a mismatched Alipay detail unknown without changing the payment result', async () => {
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    const processing = await store.markSubmitted(
      claimed,
      PaymentBatchStatus.PROCESSING,
      'ALI-BAT-1',
    )

    await expect(
      store.applyQuery(processing, {
        status: PaymentExecutionStatus.SUCCESS,
        raw: {
          code: '10000',
          outBatchNo: processing.batchNo,
          batchStatus: 'SUCCESS',
          accDetailList: [
            {
              outBizNo: 'OTHER-PAYMENT',
              detailId: 'DETAIL-1',
              status: 'SUCCESS',
              transAmount: '100.00',
            },
          ],
        },
      }),
    ).rejects.toThrow('支付宝批次包含未知支付明细')
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'PROCESSING' }])
  })

  it('moves a C2C order into payment processing and restores it after explicit failure', async () => {
    await configureC2cPayment()
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))

    await expect(readMerchantOrderStatus()).resolves.toBe('PAYMENT_PROCESSING')
    await store.fail(claimed, 'payment rejected')
    await expect(readMerchantOrderStatus()).resolves.toBe('PENDING_PAYMENT')
  })

  it('returns a successful C2C payment for platform confirmation', async () => {
    await configureC2cPayment()
    const created = await service.create(tenantId, [orderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    const processing = await store.markSubmitted(claimed, PaymentBatchStatus.PROCESSING)

    const outcome = await store.applyQuery(processing, successfulQuery(processing.batchNo))

    expect(outcome.paymentsToConfirm).toEqual([
      expect.objectContaining({ id: orderId, tenantId, status: 'SUCCESS' }),
    ])
    await expect(
      dataSource.query(`SELECT status FROM payment_order WHERE id = $1`, [orderId]),
    ).resolves.toEqual([{ status: 'SUCCESS' }])
    await expect(readMerchantOrderStatus()).resolves.toBe('PAYMENT_PROCESSING')
  })

  it('returns an already successful C2C detail for another platform confirmation attempt', async () => {
    await configureC2cPayment()
    const secondOrderId = '00000000-0000-4000-8000-000000000206'
    await insertPaymentOrder(secondOrderId, 'source-2', 'PAY-2')
    const created = await service.create(tenantId, [orderId, secondOrderId])
    const claimed = await store.claim(await store.prepare(tenantId, created.batch.id))
    const processing = await store.markSubmitted(claimed, PaymentBatchStatus.PROCESSING)
    const partialQuery = {
      status: PaymentExecutionStatus.PROCESSING,
      raw: {
        code: '10000',
        outBatchNo: processing.batchNo,
        batchStatus: 'DEALING' as const,
        accDetailList: [
          {
            outBizNo: 'PAY-1',
            detailId: 'DETAIL-1',
            status: 'SUCCESS' as const,
            transAmount: '100.00',
          },
          {
            outBizNo: 'PAY-2',
            detailId: 'DETAIL-2',
            status: 'DEALING' as const,
            transAmount: '100.00',
          },
        ],
      },
    }
    await store.applyQuery(processing, partialQuery)
    await dataSource.query(
      `UPDATE payment_order SET status = 'PLATFORM_CONFIRM_PENDING' WHERE id = $1`,
      [orderId],
    )

    const retried = await store.applyQuery(processing, partialQuery)

    expect(retried.paymentsToConfirm).toEqual([
      expect.objectContaining({ id: orderId, status: 'PLATFORM_CONFIRM_PENDING' }),
    ])
  })

  function successfulQuery(batchNo: string) {
    return {
      status: PaymentExecutionStatus.SUCCESS,
      raw: {
        code: '10000',
        outBatchNo: batchNo,
        batchStatus: 'SUCCESS' as const,
        accDetailList: [
          {
            outBizNo: 'PAY-1',
            detailId: 'DETAIL-1',
            alipayOrderNo: 'ALI-ORDER-1',
            status: 'SUCCESS' as const,
            transAmount: '100.00',
          },
        ],
      },
    }
  }

  async function configureC2cPayment(): Promise<void> {
    await dataSource.query(
      `INSERT INTO merchant_order
         ("tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
          asset, "assetAmount", "fiatCurrency", "fiatAmount", "paymentMethod",
          "platformPaymentMethodId", "payeeIdentity", "payeeName", payable,
          "paymentDeadline", "platformCreatedAt", "lastSyncedAt")
       VALUES ($1, $2, 'BINANCE', 'source-1', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT',
               'USDT', 10, 'CNY', 100.00, 'ALIPAY', 'ALIPAY-1', 'payee@example.com', 'Payee',
               true, now() + interval '10 minutes', now(), now())`,
      [tenantId, merchantId],
    )
    await dataSource.query(`UPDATE payment_order SET "sourceType" = 'C2C_BUY' WHERE id = $1`, [
      orderId,
    ])
  }

  async function readMerchantOrderStatus(): Promise<string> {
    const [{ status }] = (await dataSource.query(
      `SELECT status FROM merchant_order WHERE "platformOrderId" = 'source-1'`,
    )) as Array<{ status: string }>
    return status
  }

  async function readBatchCounts(batchId: string) {
    const [counts] = (await dataSource.query(
      `SELECT "successCount", "failedCount", "processingCount", "unknownCount"
       FROM payment_batch WHERE id = $1`,
      [batchId],
    )) as Array<{
      successCount: number
      failedCount: number
      processingCount: number
      unknownCount: number
    }>
    return counts
  }

  function insertPaymentOrder(id: string, sourceBusinessNo: string, paymentNo: string) {
    return dataSource.query(
      `INSERT INTO payment_order
         (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo", amount,
          currency, "paymentMethod", "executionMode", "payeeIdentity", "payeeName",
          "paymentPlanId", "paymentAccountId", "paymentAccountChannelId", status)
       VALUES ($1, $2, $3, 'BOT_MANUAL', $4, $5, 100.00, 'CNY', 'ALIPAY', 'BATCH',
               'payee@example.com', 'Payee', $6, $7, $8, 'READY')`,
      [id, tenantId, merchantId, sourceBusinessNo, paymentNo, planId, accountId, accountChannelId],
    )
  }

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
