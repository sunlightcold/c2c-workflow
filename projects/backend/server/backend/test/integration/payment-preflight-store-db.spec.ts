/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantPaymentPlanEntity,
  MerchantPlatformCredentialEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentOrderEntity,
  PaymentPlatformEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cPaymentBatchPolicies } from '@/apps/admin/database/migrations/c2c-payment-batch-policies.migration'
import { migratePaymentAccountCredentials } from '@/apps/admin/database/migrations/payment-account-credentials.migration'
import { migrateC2cAutomaticPayments } from '@/apps/admin/database/migrations/c2c-automatic-payments.migration'
import { migrateC2cPaymentPlanAutomation } from '@/apps/admin/database/migrations/c2c-payment-plan-automation.migration'
import { migrateC2cPlatformConfirmationControl } from '@/apps/admin/database/migrations/c2c-platform-confirmation-control.migration'
import { migrateC2cFullProviderParity } from '@/apps/admin/database/migrations/c2c-full-provider-parity.migration'
import { migrateC2cPaymentPlatformStateSeparation } from '@/apps/admin/database/migrations/c2c-payment-platform-state-separation.migration'
import { PaymentNotSubmittedError } from '@/apps/admin/modules/payment/payment-execution-coordinator'
import { TypeOrmPaymentPreflightStore } from '@/apps/admin/modules/payment/typeorm-payment-preflight.store'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'
import { C2cBuyOrderStatus } from '@/apps/admin/modules/c2c-platform'

describe('Payment preflight store database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `payment_preflight_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const merchantId = '00000000-0000-4000-8000-000000000601'
  const merchantOrderId = '00000000-0000-4000-8000-000000000602'
  const accountId = '00000000-0000-4000-8000-000000000603'
  const accountChannelId = '00000000-0000-4000-8000-000000000604'
  const planId = '00000000-0000-4000-8000-000000000605'
  const paymentOrderId = '00000000-0000-4000-8000-000000000606'
  let adminDataSource: DataSource
  let dataSource: DataSource
  let store: TypeOrmPaymentPreflightStore

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
        MerchantPlatformCredentialEntity,
        PaymentAccountChannelEntity,
        PaymentAccountEntity,
        PaymentChannelEntity,
        PaymentOrderEntity,
        PaymentPlatformEntity,
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
      await migrateC2cMerchantAccountOperations(manager)
      await migrateC2cMerchantOrders(manager)
      await migrateC2cMerchantOrderAppeals(manager)
      await migrateC2cPaymentBatches(manager)
      await migrateC2cAutomaticPayments(manager)
      await migrateC2cPaymentBatchPolicies(manager)
      await migrateC2cPaymentPlanAutomation({ query: manager.query.bind(manager) })
      await migrateC2cPlatformConfirmationControl({ query: manager.query.bind(manager) })
      await migrateC2cFullProviderParity(manager)
      await migrateC2cPaymentPlatformStateSeparation({ query: manager.query.bind(manager) })
      await manager.query(
        `INSERT INTO merchant (id, "tenantId", code, name, platform, "apiBaseUrl")
         VALUES ($1, $2, 'preflight-merchant', 'Preflight Merchant', 'BINANCE',
                 'https://api.binance.com')`,
        [merchantId, tenantId],
      )
      await manager.query(
        `INSERT INTO merchant_platform_credential
           ("tenantId", "merchantId", platform, version, "credentialRef", "authMode",
            "apiBaseUrl", "clientType")
         VALUES ($1, $2, 'BINANCE', 1, 'env://BINANCE_PREFLIGHT', 'API_KEY',
                 'https://api.binance.com', 'WEB')`,
        [tenantId, merchantId],
      )
      await manager.query(
        `INSERT INTO merchant_order
           (id, "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus",
            status, asset, "assetAmount", "fiatCurrency", "fiatAmount", "paymentMethod",
            "platformPaymentMethodId", "payeeIdentity", "payeeName", payable, "paymentDeadline",
            "platformCreatedAt", "lastSyncedAt")
         VALUES ($1, $2, $3, 'BINANCE', 'BIN-PREFLIGHT-1', 'BUY', 'PENDING_PAYMENT',
                 'PENDING_PAYMENT', 'USDT', 10, 'CNY', 100.00, 'ALIPAY', '901',
                 'payee@example.com', 'Payee', true, '2026-09-10T09:00:00Z',
                 '2026-09-10T07:00:00Z', '2026-09-10T07:01:00Z')`,
        [merchantOrderId, tenantId, merchantId],
      )
      await manager.query(
        `INSERT INTO payment_account
           (id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef")
         VALUES ($1, $2, $3, 'preflight-account', 'Preflight Account', '2088',
                 'env://ALIPAY_PREFLIGHT')`,
        [accountId, tenantId, C2C_FOUNDATION_IDS.alipayPlatform],
      )
      await manager.query(
        `INSERT INTO payment_account_channel (id, "paymentAccountId", "channelId")
         VALUES ($1, $2, $3)`,
        [accountChannelId, accountId, C2C_FOUNDATION_IDS.alipayMerchantTransferChannel],
      )
      await manager.query(
        `INSERT INTO merchant_payment_plan
           (id, "tenantId", "merchantId", scene, currency, "paymentAccountId",
            "paymentAccountChannelId")
         VALUES ($1, $2, $3, 'C2C_BUY', 'CNY', $4, $5)`,
        [planId, tenantId, merchantId, accountId, accountChannelId],
      )
      await manager.query(
        `INSERT INTO payment_order
           (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo", amount,
            currency, "paymentMethod", "executionMode", "payeeIdentity", "payeeName",
            "paymentPlanId", "paymentAccountId", "paymentAccountChannelId", status)
         VALUES ($1, $2, $3, 'C2C_BUY', 'BIN-PREFLIGHT-1', 'PAY-PREFLIGHT-1', 100.00,
                 'CNY', 'ALIPAY', 'INSTANT', 'payee@example.com', 'Payee', $4, $5, $6,
                 'SUBMITTING')`,
        [paymentOrderId, tenantId, merchantId, planId, accountId, accountChannelId],
      )
    })
    store = new TypeOrmPaymentPreflightStore(dataSource)
  })

  beforeEach(async () => {
    await dataSource.query('DELETE FROM merchant_order_status_history')
    await dataSource.query(
      `UPDATE merchant_order
       SET status = 'PENDING_PAYMENT', "platformStatus" = 'PENDING_PAYMENT', payable = true,
           "lastError" = NULL
       WHERE id = $1`,
      [merchantOrderId],
    )
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('loads the complete locked route and internal platform credential reference', async () => {
    await expect(store.load(tenantId, paymentOrderId)).resolves.toMatchObject({
      order: { id: paymentOrderId, tenantId, merchantId },
      merchantOrder: {
        id: merchantOrderId,
        tenantId,
        merchantId,
        platformOrderId: 'BIN-PREFLIGHT-1',
      },
      credential: { credentialRef: 'env://BINANCE_PREFLIGHT' },
      account: { id: accountId, tenantId, credentialRef: 'env://ALIPAY_PREFLIGHT' },
      accountChannel: { id: accountChannelId, paymentAccountId: accountId },
      channel: { id: C2C_FOUNDATION_IDS.alipayMerchantTransferChannel },
    })
  })

  it('keeps the payment account Secret reference out of ordinary repository reads', async () => {
    const account = await dataSource
      .getRepository(PaymentAccountEntity)
      .findOneByOrFail({ id: accountId, tenantId })

    expect(account.credentialRef).toBeUndefined()
  })

  it('does not load a payment order through another tenant scope', async () => {
    await expect(
      store.load('00000000-0000-4000-8000-000000000999', paymentOrderId),
    ).rejects.toEqual(new PaymentNotSubmittedError('支付订单不存在或不属于当前所属单位'))
  })

  it('advances merchant confirmation state transactionally and does not duplicate history', async () => {
    await store.transitionMerchantOrder(
      tenantId,
      merchantOrderId,
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      C2cBuyOrderStatus.PENDING_PAYMENT,
    )
    await store.transitionMerchantOrder(
      tenantId,
      merchantOrderId,
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
      C2cBuyOrderStatus.PENDING_PAYMENT,
    )
    await store.transitionMerchantOrder(
      tenantId,
      merchantOrderId,
      MerchantOrderStatus.PENDING_RELEASE,
      C2cBuyOrderStatus.PAID,
    )

    await expect(
      dataSource.query(
        `SELECT status, "platformStatus", payable, "lastError"
         FROM merchant_order WHERE id = $1`,
        [merchantOrderId],
      ),
    ).resolves.toEqual([
      { status: 'PENDING_RELEASE', platformStatus: 'PAID', payable: false, lastError: null },
    ])
    await expect(
      dataSource.query(
        `SELECT "fromStatus", "toStatus", source
         FROM merchant_order_status_history WHERE "merchantOrderId" = $1 ORDER BY "createdAt"`,
        [merchantOrderId],
      ),
    ).resolves.toEqual([
      {
        fromStatus: 'PENDING_PAYMENT',
        toStatus: 'PAID_PENDING_PLATFORM_CONFIRM',
        source: 'PLATFORM_PAYMENT_CONFIRMATION',
      },
      {
        fromStatus: 'PAID_PENDING_PLATFORM_CONFIRM',
        toStatus: 'PENDING_RELEASE',
        source: 'PLATFORM_PAYMENT_CONFIRMATION',
      },
    ])
  })
})
