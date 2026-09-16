/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantOrderAutoAppealStatus,
  MerchantOrderCompletionReplyStatus,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  PaymentOrderEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cAutomaticPayments } from '@/apps/admin/database/migrations/c2c-automatic-payments.migration'
import { migrateC2cFullProviderParity } from '@/apps/admin/database/migrations/c2c-full-provider-parity.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migrateC2cPlatformConfirmationControl } from '@/apps/admin/database/migrations/c2c-platform-confirmation-control.migration'
import { C2cCompletionReplyService } from '@/apps/admin/modules/c2c-order/c2c-completion-reply.service'
import { C2cAutoAppealService } from '@/apps/admin/modules/c2c-order/c2c-auto-appeal.service'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('C2C completion reply database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_completion_reply_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000091'
  const orderId = '00000000-0000-4000-8000-000000000092'
  const now = new Date('2026-09-16T08:00:00.000Z')
  let adminDataSource: DataSource
  let dataSource: DataSource
  let platformChat: { sendOrderCompletedStrict: jest.Mock }

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
        MerchantEntity,
        MerchantOrderEntity,
        MerchantOrderStatusHistoryEntity,
        PaymentOrderEntity,
      ],
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await dataSource.transaction(async (manager) => {
      await migrateC2cBusinessFoundation(manager)
      await migrateC2cPaymentOrders(manager)
      await migrateC2cPaymentRouting(manager)
      await migrateC2cMerchantPlatformCredentials(manager)
      await migrateC2cMerchantOrders(manager)
      await migrateC2cPaymentBatches(manager)
      await migrateC2cMerchantAccountOperations(manager)
      await migrateC2cMerchantOrderAppeals(manager)
      await migrateC2cAutomaticPayments(manager)
      await migrateC2cPlatformConfirmationControl({ query: manager.query.bind(manager) })
      await migrateC2cFullProviderParity(manager)
    })
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM merchant_order')
    await dataSource.query('DELETE FROM payment_order')
    await dataSource.query('DELETE FROM merchant WHERE id = $1', [merchantId])
    await dataSource.query(
      `INSERT INTO merchant (
        id, "tenantId", code, name, platform, "apiBaseUrl", status,
        "c2cChatOrderCompletedEnabled", "c2cChatOrderCompletedEnabledAt"
      ) VALUES ($1, $2, 'completion-reply', 'Completion Reply', 'BINANCE',
        'https://api.binance.com', 'active', true, $3)`,
      [merchantId, tenantId, new Date('2026-09-16T00:00:00.000Z')],
    )
    await dataSource.query(
      `INSERT INTO merchant_order (
        id, "tenantId", "merchantId", platform, "platformOrderId", side,
        "platformStatus", status, asset, "assetAmount", "fiatCurrency", "fiatAmount",
        "platformCreatedAt", "lastSyncedAt"
      ) VALUES ($1, $2, $3, 'BINANCE', 'BIN-COMPLETED-1', 'BUY', 'COMPLETED', 'COMPLETED',
        'USDT', 10, 'CNY', 70, $4, $4)`,
      [orderId, tenantId, merchantId, new Date('2026-09-16T01:00:00.000Z')],
    )
    platformChat = { sendOrderCompletedStrict: jest.fn().mockResolvedValue(undefined) }
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  function createService() {
    const unusedDependency = undefined as never
    return new C2cCompletionReplyService(
      dataSource.getRepository(MerchantEntity),
      dataSource.getRepository(MerchantOrderEntity),
      dataSource,
      unusedDependency,
      unusedDependency,
      unusedDependency,
      unusedDependency,
      platformChat as never,
    )
  }

  async function expectReplySent() {
    expect(platformChat.sendOrderCompletedStrict).toHaveBeenCalledWith(
      tenantId,
      merchantId,
      orderId,
    )
    const order = await dataSource
      .getRepository(MerchantOrderEntity)
      .findOneByOrFail({ id: orderId })
    expect(order.completionReplyStatus).toBe(MerchantOrderCompletionReplyStatus.SENT)
  }

  it('scans and sends a completion reply with PostgreSQL', async () => {
    await expect(createService().scanAll(now)).resolves.toEqual([
      expect.objectContaining({ merchantId, candidates: 1, sent: 1, failed: 0 }),
    ])
    await expectReplySent()
  })

  it('sends newly completed orders directly with PostgreSQL', async () => {
    await expect(
      createService().sendCompletedOrders(tenantId, merchantId, [orderId], now),
    ).resolves.toBeUndefined()
    await expectReplySent()
  })

  it('scans automatic appeal candidates with PostgreSQL', async () => {
    await dataSource.query(
      `UPDATE merchant
       SET "c2cChatOrderCompletedEnabled" = false,
           "autoAppealEnabled" = true,
           "autoAppealEnabledAt" = $2,
           "autoAppealDelayMinutes" = 18
       WHERE id = $1`,
      [merchantId, new Date('2026-09-16T00:00:00.000Z')],
    )
    await dataSource.query(
      `UPDATE merchant_order
       SET status = 'PENDING_RELEASE', "platformStatus" = 'PENDING_RELEASE'
       WHERE id = $1`,
      [orderId],
    )
    await dataSource.query(
      `INSERT INTO payment_order (
        "createdAt", "updatedAt", "tenantId", "merchantId", "sourceType",
        "sourceBusinessNo", "paymentNo", amount, currency, "paymentMethod", "executionMode",
        "payeeIdentity", "payeeName", status, "platformConfirmStatus"
      ) VALUES ($1, $1, $2, $3, 'C2C_BUY', 'BIN-COMPLETED-1', 'PAY-AUTO-APPEAL-1',
        70, 'CNY', 'ALIPAY', 'INSTANT', 'payee@example.com', 'Payee', 'SUCCESS', 'SUCCESS')`,
      [new Date('2026-09-16T07:00:00.000Z'), tenantId, merchantId],
    )
    const appeals = { submitForAuto: jest.fn().mockResolvedValue(undefined) }
    const service = new C2cAutoAppealService(
      dataSource.getRepository(MerchantEntity),
      dataSource.getRepository(MerchantOrderEntity),
      appeals as never,
    )

    const results = await service.scanAll(now)
    expect(results).toEqual([
      expect.objectContaining({ merchantId, candidates: 1, submitted: 1, retry: 0 }),
    ])
    expect(appeals.submitForAuto).toHaveBeenCalledWith(tenantId, merchantId, orderId)
    const order = await dataSource
      .getRepository(MerchantOrderEntity)
      .findOneByOrFail({ id: orderId })
    expect(order.autoAppealStatus).toBe(MerchantOrderAutoAppealStatus.SUBMITTED)
  })
})
