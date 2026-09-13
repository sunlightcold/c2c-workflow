/// <reference types="jest" />

import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
  MerchantPaymentPlanEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentBatchEntity,
  PaymentBatchItemEntity,
  PaymentBatchStatusHistoryEntity,
  PaymentExecutionMode,
  PaymentOrderEntity,
  PaymentOrderStatus,
  PaymentOrderStatusHistoryEntity,
  PaymentPlatformEntity,
  PaymentChannelEntity,
  TenantEntity,
} from '@/apps/admin/database'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migratePaymentAccountCredentials } from '@/apps/admin/database/migrations/payment-account-credentials.migration'
import { migrateC2cAutomaticPayments } from '@/apps/admin/database/migrations/c2c-automatic-payments.migration'
import { MerchantPlatformCredentialService } from '@/apps/admin/modules/business/merchant-platform-credential.service'
import { C2cOrderService } from '@/apps/admin/modules/c2c-order/c2c-order.service'
import { C2cOrderSyncService } from '@/apps/admin/modules/c2c-order/c2c-order-sync.service'
import { EnvironmentC2cSecretResolver } from '@/apps/admin/modules/c2c-order/c2c-secret-resolver'
import { TypeOrmC2cOrderSyncStore } from '@/apps/admin/modules/c2c-order/typeorm-c2c-order-sync.store'
import { AxiosC2cHttpTransport } from '@/apps/admin/modules/c2c-platform/axios-c2c-http.transport'
import {
  BinanceC2cClient,
  C2cPlatformCredentialFactory,
  OkxWebPrivateClient,
} from '@/apps/admin/modules/c2c-platform'
import { AlipayAccountGatewayProvider } from '@/apps/admin/modules/payment/alipay-account-gateway.provider'
import { AlipayBatchPaymentExecutor } from '@/apps/admin/modules/payment/alipay-batch-payment.executor'
import { AlipayGatewayFactory } from '@/apps/admin/modules/payment/alipay-gateway.factory'
import { C2cAlipayPaymentExecutor } from '@/apps/admin/modules/payment/c2c-alipay-payment.executor'
import { C2cAutomaticPaymentService } from '@/apps/admin/modules/payment/c2c-automatic-payment.service'
import { C2cMerchantPaymentService } from '@/apps/admin/modules/payment/c2c-merchant-payment.service'
import { C2cPaymentCancellationService } from '@/apps/admin/modules/payment/c2c-payment-cancellation.service'
import { C2cPaymentPreflightVerifier } from '@/apps/admin/modules/payment/c2c-payment-preflight-verifier'
import { C2cPlatformPaymentConfirmer } from '@/apps/admin/modules/payment/c2c-platform-payment.confirmer'
import { PaymentBatchExecutionCoordinator } from '@/apps/admin/modules/payment/payment-batch-execution-coordinator'
import { PaymentBatchService } from '@/apps/admin/modules/payment/payment-batch.service'
import { PaymentExecutionCoordinator } from '@/apps/admin/modules/payment/payment-execution-coordinator'
import { PaymentOrderService } from '@/apps/admin/modules/payment/payment-order.service'
import { PaymentPlanResolver } from '@/apps/admin/modules/payment/payment-plan-resolver'
import { TypeOrmC2cAutomaticPaymentStore } from '@/apps/admin/modules/payment/typeorm-c2c-automatic-payment.store'
import { TypeOrmPaymentBatchStore } from '@/apps/admin/modules/payment/typeorm-payment-batch.store'
import { TypeOrmPaymentOrderStore } from '@/apps/admin/modules/payment/typeorm-payment-order.store'
import { TypeOrmPaymentPreflightStore } from '@/apps/admin/modules/payment/typeorm-payment-preflight.store'
import { C2cAutomationJob } from '@/apps/admin/modules/system/task/jobs/c2c-automation.job'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'
import { generateKeyPairSync } from 'node:crypto'

const MOCK_ORIGIN = 'http://127.0.0.1:13002'
const OKX_E2E_KEY_PAIR = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
const merchantIds = {
  binance: '31000000-0000-4000-8000-000000000001',
  okx: '31000000-0000-4000-8000-000000000002',
  batch: '31000000-0000-4000-8000-000000000003',
} as const
const paymentAccountIds = {
  instant: '32000000-0000-4000-8000-000000000001',
  batch: '32000000-0000-4000-8000-000000000002',
} as const
const paymentAccountChannelIds = {
  instant: '33000000-0000-4000-8000-000000000001',
  batch: '33000000-0000-4000-8000-000000000002',
} as const

interface WorkflowHarness {
  dataSource: DataSource
  job: C2cAutomationJob
}

describe('Automatic C2C payment workflow database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `automatic_payment_workflow_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let harness: WorkflowHarness

  beforeAll(async () => {
    await requireMock()
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    const dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      logging: false,
      entities: [
        TenantEntity,
        MerchantEntity,
        MerchantPlatformCredentialEntity,
        MerchantOrderEntity,
        MerchantOrderStatusHistoryEntity,
        MerchantOrderSyncCheckpointEntity,
        PaymentPlatformEntity,
        PaymentChannelEntity,
        PaymentAccountEntity,
        PaymentAccountChannelEntity,
        MerchantPaymentPlanEntity,
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
      await migrateC2cMerchantOrders(manager)
      await migrateC2cPaymentBatches(manager)
      await migrateC2cMerchantAccountOperations(manager)
      await migrateC2cMerchantOrderAppeals(manager)
      await migratePaymentAccountCredentials(manager)
      await migrateC2cAutomaticPayments(manager)
    })
    harness = createHarness(dataSource)
  })

  beforeEach(async () => {
    await resetDatabase(harness.dataSource)
    await Promise.all([
      mock('/api/mock/binance-c2c/reset', { method: 'POST' }),
      mock('/api/mock/okx-c2c/reset', { method: 'POST' }),
      mock('/api/mock/alipay-transfer/reset', { method: 'POST' }),
      mock('/api/mock/alipay-batch/reset', { method: 'POST' }),
    ])
    await mock('/api/mock/okx-c2c/config', {
      method: 'PATCH',
      body: JSON.stringify({
        signaturePublicKey: OKX_E2E_KEY_PAIR.publicKey
          .export({ format: 'der', type: 'spki' })
          .toString('base64'),
      }),
    })
  })

  afterAll(async () => {
    if (harness?.dataSource.isInitialized) await harness.dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
    delete process.env.C2C_E2E_BINANCE_SECRET
    delete process.env.C2C_E2E_OKX_SECRET
    delete process.env.C2C_E2E_ALIPAY_SECRET
  })

  it('discovers a Binance order, pays once, and retries only the platform confirmation', async () => {
    await seedMerchant(harness.dataSource, merchantIds.binance, MerchantPlatform.BINANCE)
    await seedPaymentRoute(harness.dataSource, merchantIds.binance, PaymentExecutionMode.INSTANT)
    await addBinanceOrder('BIN-E2E-1001', '88.60')
    await mock('/api/mock/binance-c2c/config', {
      method: 'PATCH',
      body: JSON.stringify({ markOrderAsPaidFailure: true }),
    })

    await expect(harness.job.syncDueOrders()).resolves.toMatchObject({ claimed: 1, succeeded: 1 })
    const merchantOrder = await findMerchantOrder(harness.dataSource, 'BIN-E2E-1001')
    expect(merchantOrder).toMatchObject({
      status: MerchantOrderStatus.PENDING_PAYMENT,
      identityMatched: true,
      paymentMethod: 'ALIPAY',
    })

    const concurrent = await Promise.all([
      harness.job.processAutomaticPayments(),
      harness.job.processAutomaticPayments(),
    ])
    expect(concurrent.reduce((total, result) => total + result.orders.failed, 0)).toBe(0)
    let payment = await findPayment(harness.dataSource, 'BIN-E2E-1001')
    expect(payment.status).toBe(PaymentOrderStatus.PROCESSING)
    await advanceTransfer(payment.payeeIdentity, 'SUCCESS')

    await harness.job.recoverPayments()
    payment = await findPayment(harness.dataSource, 'BIN-E2E-1001')
    expect(payment.status).toBe(PaymentOrderStatus.PLATFORM_CONFIRM_PENDING)
    expect((await findMerchantOrder(harness.dataSource, 'BIN-E2E-1001')).status).toBe(
      MerchantOrderStatus.PAID_PENDING_PLATFORM_CONFIRM,
    )
    expect((await transferOrders()).total).toBe(1)

    await mock('/api/mock/binance-c2c/config', {
      method: 'PATCH',
      body: JSON.stringify({ markOrderAsPaidFailure: false }),
    })
    await harness.job.recoverPayments()
    await harness.job.processAutomaticPayments()
    await harness.job.recoverPayments()

    expect((await findPayment(harness.dataSource, 'BIN-E2E-1001')).status).toBe(
      PaymentOrderStatus.COMPLETED,
    )
    expect((await findMerchantOrder(harness.dataSource, 'BIN-E2E-1001')).status).toBe(
      MerchantOrderStatus.PENDING_RELEASE,
    )
    expect((await transferOrders()).total).toBe(1)
    expect(await paymentCount(harness.dataSource, 'BIN-E2E-1001')).toBe(1)
    const binance = await mock<Array<{ orderNumber: string; orderStatus: number }>>(
      '/api/mock/binance-c2c/orders',
    )
    expect(binance.find(({ orderNumber }) => orderNumber === 'BIN-E2E-1001')?.orderStatus).toBe(2)
  })

  it('discovers an OKX order, completes payment, and marks the platform order paid', async () => {
    await seedMerchant(harness.dataSource, merchantIds.okx, MerchantPlatform.OKX)
    await seedPaymentRoute(harness.dataSource, merchantIds.okx, PaymentExecutionMode.INSTANT)

    await harness.job.syncDueOrders()
    await harness.job.processAutomaticPayments()
    const payment = await findPayment(harness.dataSource, '260905000000001')
    expect(payment.status).toBe(PaymentOrderStatus.PROCESSING)
    await advanceTransfer(payment.payeeIdentity, 'SUCCESS')
    await harness.job.recoverPayments()

    expect(await findPayment(harness.dataSource, '260905000000001')).toMatchObject({
      status: PaymentOrderStatus.COMPLETED,
      lastError: null,
    })
    expect((await findMerchantOrder(harness.dataSource, '260905000000001')).status).toBe(
      MerchantOrderStatus.PENDING_RELEASE,
    )
    expect((await transferOrders()).total).toBe(1)
    const okx = await mock<
      Array<{
        publicTradingOrderId: string
        orderStatus: string
        paymentStatus: string
      }>
    >('/api/mock/okx-c2c/orders')
    expect(
      okx.find(({ publicTradingOrderId }) => publicTradingOrderId === '260905000000001-trading'),
    ).toMatchObject({ orderStatus: 'new', paymentStatus: 'paid' })
  })

  it('finishes an already submitted payment after the merchant and locked route are disabled', async () => {
    await seedMerchant(harness.dataSource, merchantIds.binance, MerchantPlatform.BINANCE)
    await seedPaymentRoute(harness.dataSource, merchantIds.binance, PaymentExecutionMode.INSTANT)
    await addBinanceOrder('BIN-E2E-STOPPED-1001', '66.80')

    await harness.job.syncDueOrders()
    await harness.job.processAutomaticPayments()
    const payment = await findPayment(harness.dataSource, 'BIN-E2E-STOPPED-1001')
    expect(payment.status).toBe(PaymentOrderStatus.PROCESSING)

    await Promise.all([
      harness.dataSource.query(`UPDATE merchant SET status = 'disabled' WHERE id = $1`, [
        merchantIds.binance,
      ]),
      harness.dataSource.query(
        `UPDATE merchant_payment_plan SET status = 'disabled' WHERE "tenantId" = $1 AND "merchantId" = $2`,
        [tenantId, merchantIds.binance],
      ),
      harness.dataSource.query(`UPDATE payment_account SET status = 'disabled' WHERE id = $1`, [
        paymentAccountIds.instant,
      ]),
      harness.dataSource.query(
        `UPDATE payment_account_channel SET status = 'disabled' WHERE id = $1`,
        [paymentAccountChannelIds.instant],
      ),
    ])
    await advanceTransfer(payment.payeeIdentity, 'SUCCESS')

    await harness.job.recoverPayments()

    expect((await findPayment(harness.dataSource, 'BIN-E2E-STOPPED-1001')).status).toBe(
      PaymentOrderStatus.COMPLETED,
    )
    expect((await findMerchantOrder(harness.dataSource, 'BIN-E2E-STOPPED-1001')).status).toBe(
      MerchantOrderStatus.PENDING_RELEASE,
    )
    expect((await transferOrders()).total).toBe(1)
  })

  it('batches discovered orders, reconciles the original batch, and never pays twice', async () => {
    await seedMerchant(
      harness.dataSource,
      merchantIds.batch,
      MerchantPlatform.BINANCE,
      PaymentExecutionMode.BATCH,
    )
    await seedPaymentRoute(harness.dataSource, merchantIds.batch, PaymentExecutionMode.BATCH)
    await mock('/api/mock/alipay-batch/config', {
      method: 'PATCH',
      body: JSON.stringify({
        autoAdvanceAfterQueries: 2,
        autoAdvanceBatchStatus: 'SUCCESS',
        autoAdvanceDetailStatus: 'SUCCESS',
        randomDetailFailRate: 0,
        notifyUrl: '',
      }),
    })
    await addBinanceOrder('BIN-BATCH-1001', '40.10')
    await addBinanceOrder('BIN-BATCH-1002', '59.90')

    await harness.job.syncDueOrders()
    const processed = await harness.job.processAutomaticPayments()
    expect(processed).toEqual({
      orders: { found: 2, succeeded: 2, failed: 0 },
      batches: { found: 1, succeeded: 1, failed: 0 },
    })
    expect(
      await harness.dataSource.query(
        `SELECT status, "lastError" FROM payment_batch ORDER BY "createdAt"`,
      ),
    ).toEqual([{ status: 'PROCESSING', lastError: null }])
    expect((await batchOrders()).total).toBe(1)
    expect(await paymentStatuses(harness.dataSource)).toEqual([
      PaymentOrderStatus.PROCESSING,
      PaymentOrderStatus.PROCESSING,
    ])

    await harness.job.recoverPayments()
    await harness.job.processAutomaticPayments()
    await harness.job.recoverPayments()

    expect(await paymentStatuses(harness.dataSource)).toEqual([
      PaymentOrderStatus.COMPLETED,
      PaymentOrderStatus.COMPLETED,
    ])
    expect((await batchOrders()).total).toBe(1)
    expect(
      await harness.dataSource.query(`SELECT status FROM payment_batch ORDER BY "createdAt"`),
    ).toEqual([{ status: 'SUCCESS' }])
    expect(
      await harness.dataSource.query(
        `SELECT status FROM merchant_order ORDER BY "platformOrderId"`,
      ),
    ).toEqual([
      { status: MerchantOrderStatus.PENDING_RELEASE },
      { status: MerchantOrderStatus.PENDING_RELEASE },
    ])
  })

  it('selects only active-tenant, enabled, identity-matched orders with an unexpired deadline', async () => {
    const now = new Date('2026-09-13T04:00:00.000Z')
    const disabledTenantId = '35000000-0000-4000-8000-000000000001'
    await harness.dataSource.query(
      `INSERT INTO tenant (id, type, code, name, status, timezone, "systemLocked")
       VALUES ($1, 'AGENT', 'disabled-tenant', 'Disabled tenant', 'disabled', 'Asia/Shanghai', false)`,
      [disabledTenantId],
    )
    const candidates = [
      ['eligible', tenantId, true, 'active', true, new Date(now.getTime() + 60_000)],
      ['tenant-disabled', disabledTenantId, true, 'active', true, new Date(now.getTime() + 60_000)],
      ['automation-disabled', tenantId, false, 'active', true, new Date(now.getTime() + 60_000)],
      ['merchant-disabled', tenantId, true, 'disabled', true, new Date(now.getTime() + 60_000)],
      ['identity-mismatch', tenantId, true, 'active', false, new Date(now.getTime() + 60_000)],
      ['deadline-missing', tenantId, true, 'active', true, null],
      ['deadline-expired', tenantId, true, 'active', true, new Date(now.getTime() - 1)],
    ] as const
    for (const [index, candidate] of candidates.entries()) {
      const [
        suffix,
        scopeTenantId,
        automaticPaymentEnabled,
        status,
        identityMatched,
        paymentDeadline,
      ] = candidate
      const merchantId = `34000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`
      await harness.dataSource.query(
        `INSERT INTO merchant (
          id, "tenantId", code, name, platform, "apiBaseUrl", status,
          "automaticPaymentEnabled", "automaticPaymentExecutionMode"
        ) VALUES ($1, $2, $3, $3, 'BINANCE', $4, $5, $6, 'INSTANT')`,
        [merchantId, scopeTenantId, suffix, MOCK_ORIGIN, status, automaticPaymentEnabled],
      )
      await harness.dataSource.query(
        `INSERT INTO merchant_order (
          "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
          asset, "assetAmount", "fiatCurrency", "fiatAmount", "paymentMethod",
          "platformPaymentMethodId", "payeeIdentity", "payeeName", "identityName",
          "identityMatched", payable, "paymentDeadline", "platformCreatedAt", "lastSyncedAt"
        ) VALUES ($1, $2, 'BINANCE', $3, 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT',
          'USDT', 10, 'CNY', 50, 'ALIPAY', '1', 'buyer@example.com', '测试用户', '测试用户',
          $4, true, $5, $6, $6)`,
        [scopeTenantId, merchantId, suffix, identityMatched, paymentDeadline, now],
      )
    }

    const result = await new TypeOrmC2cAutomaticPaymentStore(harness.dataSource).findCandidates(
      now,
      100,
    )

    expect(
      await Promise.all(
        result.map(async ({ merchantOrderId }) =>
          harness.dataSource
            .getRepository(MerchantOrderEntity)
            .findOneByOrFail({ id: merchantOrderId }),
        ),
      ),
    ).toEqual([expect.objectContaining({ platformOrderId: 'eligible' })])

    const claimed = await new TypeOrmC2cOrderSyncStore(harness.dataSource).claimDue(
      'tenant-status-test',
      now,
      100,
      120_000,
    )
    expect(claimed).not.toContainEqual(expect.objectContaining({ tenantId: disabledTenantId }))
  })
})

function createHarness(dataSource: DataSource): WorkflowHarness {
  process.env.C2C_E2E_BINANCE_SECRET = JSON.stringify({
    apiKey: 'mock-binance-api-key',
    secretKey: 'mock-binance-secret-key',
  })
  process.env.C2C_E2E_OKX_SECRET = JSON.stringify({
    cookie: 'token=mock-okx-token; sid=mock-okx-session',
    authorization: 'Bearer mock-okx-authorization',
    signaturePrivateKey: OKX_E2E_KEY_PAIR.privateKey
      .export({ format: 'der', type: 'pkcs8' })
      .toString('base64'),
    skipPaymentProofUpload: true,
  })
  const transport = new AxiosC2cHttpTransport()
  const binance = new BinanceC2cClient(transport)
  const okx = new OkxWebPrivateClient(transport)
  const credentialFactory = new C2cPlatformCredentialFactory()
  const secretResolver = new EnvironmentC2cSecretResolver(null as never)
  const credentialService = new MerchantPlatformCredentialService(
    dataSource.getRepository(MerchantEntity),
    dataSource.getRepository(MerchantPlatformCredentialEntity),
    dataSource,
    null as never,
    credentialFactory,
    binance,
    okx,
  )
  const syncStore = new TypeOrmC2cOrderSyncStore(dataSource)
  const orderSync = new C2cOrderSyncService(
    dataSource.getRepository(MerchantEntity),
    credentialService,
    secretResolver,
    credentialFactory,
    binance,
    okx,
    syncStore,
  )
  const orderService = new C2cOrderService(
    dataSource.getRepository(MerchantOrderEntity),
    dataSource.getRepository(MerchantOrderStatusHistoryEntity),
    dataSource.getRepository(PaymentOrderEntity),
    dataSource.getRepository(PaymentOrderStatusHistoryEntity),
  )
  const paymentPlanResolver = new PaymentPlanResolver(dataSource)
  const paymentOrderService = new PaymentOrderService(
    dataSource.getRepository(PaymentOrderEntity),
    dataSource.getRepository(MerchantEntity),
    paymentPlanResolver,
    dataSource,
  )
  const preflightStore = new TypeOrmPaymentPreflightStore(dataSource)
  const preflight = new C2cPaymentPreflightVerifier(
    preflightStore,
    secretResolver,
    credentialFactory,
    binance,
    okx,
  )
  const gatewayProvider = new AlipayAccountGatewayProvider(
    secretResolver,
    new AlipayGatewayFactory(),
  )
  const paymentCoordinator = new PaymentExecutionCoordinator(
    new TypeOrmPaymentOrderStore(dataSource),
    new C2cAlipayPaymentExecutor(preflight, gatewayProvider),
    new C2cPlatformPaymentConfirmer(
      preflightStore,
      secretResolver,
      credentialFactory,
      binance,
      okx,
    ),
  )
  const batchService = new PaymentBatchService(dataSource)
  const batchCoordinator = new PaymentBatchExecutionCoordinator(
    new TypeOrmPaymentBatchStore(dataSource),
    new AlipayBatchPaymentExecutor(gatewayProvider),
    preflight,
    paymentCoordinator,
  )
  const merchantPayments = new C2cMerchantPaymentService(
    orderService,
    paymentOrderService,
    paymentCoordinator,
    new C2cPaymentCancellationService(dataSource),
  )
  const automaticPayments = new C2cAutomaticPaymentService(
    new TypeOrmC2cAutomaticPaymentStore(dataSource),
    merchantPayments,
    paymentOrderService,
    paymentCoordinator,
    batchService,
    batchCoordinator,
  )
  return { dataSource, job: new C2cAutomationJob(syncStore, orderSync, automaticPayments) }
}

async function resetDatabase(dataSource: DataSource): Promise<void> {
  for (const table of [
    'payment_batch_status_history',
    'payment_batch_item',
    'payment_batch',
    'payment_order_status_history',
    'payment_order',
    'merchant_order_status_history',
    'merchant_order',
    'merchant_order_sync_checkpoint',
    'merchant_payment_plan',
    'payment_account_channel',
    'payment_account',
    'merchant_platform_credential',
    'merchant',
  ]) {
    await dataSource.query(`DELETE FROM ${table}`)
  }
}

async function seedMerchant(
  dataSource: DataSource,
  merchantId: string,
  platform: MerchantPlatform,
  mode = PaymentExecutionMode.INSTANT,
): Promise<void> {
  const secretRef =
    platform === MerchantPlatform.BINANCE
      ? 'env://C2C_E2E_BINANCE_SECRET'
      : 'env://C2C_E2E_OKX_SECRET'
  await dataSource.query(
    `INSERT INTO merchant (
      id, "tenantId", code, name, platform, "apiBaseUrl", status,
      "automaticPaymentEnabled", "automaticPaymentExecutionMode"
    ) VALUES ($1, $2, $3, $4, $5, $6, 'active', true, $7)`,
    [
      merchantId,
      tenantId,
      `merchant-${platform}-${mode}`,
      `${platform} E2E`,
      platform,
      MOCK_ORIGIN,
      mode,
    ],
  )
  await dataSource.query(
    `INSERT INTO merchant_platform_credential (
      "tenantId", "merchantId", platform, version, "credentialRef", "authMode",
      "apiBaseUrl", "clientType", "requestTimeoutMs", status
    ) VALUES ($1, $2, $3, 1, $4, $5, $6, $7, 5000, 'active')`,
    [
      tenantId,
      merchantId,
      platform,
      secretRef,
      platform === MerchantPlatform.BINANCE ? 'API_KEY' : 'WEB_COOKIE',
      MOCK_ORIGIN,
      platform === MerchantPlatform.BINANCE ? 'WEB' : null,
    ],
  )
}

async function seedPaymentRoute(
  dataSource: DataSource,
  merchantId: string,
  mode: PaymentExecutionMode,
): Promise<void> {
  const config = await mock<{
    mockGateway?: string
    pfaParams: { appId: string; privateKey: string; alipayPublicKey: string; gateway: string }
  }>(
    mode === PaymentExecutionMode.INSTANT
      ? '/api/mock/alipay-transfer/config'
      : '/api/mock/alipay-batch/config',
  )
  process.env.C2C_E2E_ALIPAY_SECRET = JSON.stringify({
    authMode: 'KEY',
    appId: config.pfaParams.appId,
    privateKey: config.pfaParams.privateKey,
    alipayPublicKey: config.pfaParams.alipayPublicKey,
    gateway: config.mockGateway ?? config.pfaParams.gateway,
  })
  const accountId = paymentAccountIds[mode === PaymentExecutionMode.INSTANT ? 'instant' : 'batch']
  const bindingId =
    paymentAccountChannelIds[mode === PaymentExecutionMode.INSTANT ? 'instant' : 'batch']
  const channelId =
    mode === PaymentExecutionMode.INSTANT
      ? C2C_FOUNDATION_IDS.alipayMerchantTransferChannel
      : C2C_FOUNDATION_IDS.alipayBatchChannel
  await dataSource.query(
    `INSERT INTO payment_account (
      id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef", status
    ) VALUES ($1, $2, $3, $4, $5, '2088000000000000', 'env://C2C_E2E_ALIPAY_SECRET', 'active')
    ON CONFLICT (id) DO NOTHING`,
    [accountId, tenantId, C2C_FOUNDATION_IDS.alipayPlatform, `account-${mode}`, `Alipay ${mode}`],
  )
  await dataSource.query(
    `INSERT INTO payment_account_channel (
      id, "paymentAccountId", "channelId", "concurrencyLimit", status
    ) VALUES ($1, $2, $3, 10, 'active')
    ON CONFLICT (id) DO NOTHING`,
    [bindingId, accountId, channelId],
  )
  await dataSource.query(
    `INSERT INTO merchant_payment_plan (
      "tenantId", "merchantId", scene, currency, "paymentAccountId",
      "paymentAccountChannelId", priority, weight, status
    ) VALUES ($1, $2, 'C2C_BUY', 'CNY', $3, $4, 100, 100, 'active')`,
    [tenantId, merchantId, accountId, bindingId],
  )
}

function addBinanceOrder(orderNumber: string, totalPrice: string): Promise<unknown> {
  return mock('/api/mock/binance-c2c/orders', {
    method: 'POST',
    body: JSON.stringify({
      orderNumber,
      totalPrice,
      amount: '10.00000000',
      realName: '测试用户',
      selectedPayId: '1',
      paymentMethod: {
        id: '1',
        identifier: 'ALIPAY',
        tradeMethodName: '支付宝',
        payAccount: 'buyer@example.com',
        fieldList: [{ fieldName: 'account_name', fieldValue: '测试用户' }],
      },
    }),
  })
}

async function advanceTransfer(accountNo: string, status: 'SUCCESS' | 'FAIL'): Promise<void> {
  const runId = `E2E_${Date.now()}`
  await mock(`/api/mock/alipay-transfer/runs/${runId}`, {
    method: 'PUT',
    body: JSON.stringify({ outcomes: [{ accountNo, status }] }),
  })
  await mock(`/api/mock/alipay-transfer/runs/${runId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ notify: false }),
  })
}

async function findMerchantOrder(dataSource: DataSource, platformOrderId: string) {
  const order = await dataSource.getRepository(MerchantOrderEntity).findOneBy({ platformOrderId })
  if (!order) throw new Error(`Missing merchant order ${platformOrderId}`)
  return order
}

async function findPayment(dataSource: DataSource, sourceBusinessNo: string) {
  const order = await dataSource.getRepository(PaymentOrderEntity).findOneBy({ sourceBusinessNo })
  if (!order) throw new Error(`Missing payment order ${sourceBusinessNo}`)
  return order
}

function paymentCount(dataSource: DataSource, sourceBusinessNo: string): Promise<number> {
  return dataSource.getRepository(PaymentOrderEntity).countBy({ sourceBusinessNo })
}

async function paymentStatuses(dataSource: DataSource): Promise<PaymentOrderStatus[]> {
  return (
    await dataSource.getRepository(PaymentOrderEntity).find({ order: { sourceBusinessNo: 'ASC' } })
  ).map(({ status }) => status)
}

function transferOrders() {
  return mock<{ total: number }>('/api/mock/alipay-transfer/orders')
}

function batchOrders() {
  return mock<{ total: number }>('/api/mock/alipay-batch/orders')
}

async function requireMock(): Promise<void> {
  const health = await mock<{ status: string }>('/api/mock/health')
  if (health.status !== 'ok') throw new Error('Upstream mock is not ready')
}

async function mock<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MOCK_ORIGIN}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!response.ok)
    throw new Error(`Mock ${path} failed: ${response.status} ${await response.text()}`)
  return response.json() as Promise<T>
}
