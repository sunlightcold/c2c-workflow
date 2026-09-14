import { generateKeyPairSync } from 'node:crypto'
import { C2C_FOUNDATION_IDS } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { createMigrationDataSource } from '@/apps/migrate/data-source'
import {
  decryptCredential,
  encryptCredential,
} from '@/apps/admin/modules/system/credential/credential-cipher'
import type { DataSource, EntityManager } from 'typeorm'

const MOCK_ORIGIN = process.env.C2C_MOCK_ORIGIN ?? 'http://127.0.0.1:13002'

const ids = {
  agentTenant: '51000000-0000-4000-8000-000000000001',
  headquartersBinanceMerchant: '52000000-0000-4000-8000-000000000001',
  headquartersOkxMerchant: '52000000-0000-4000-8000-000000000002',
  agentBinanceMerchant: '52000000-0000-4000-8000-000000000003',
  headquartersInstantAccount: '53000000-0000-4000-8000-000000000001',
  headquartersBatchAccount: '53000000-0000-4000-8000-000000000002',
  agentInstantAccount: '53000000-0000-4000-8000-000000000003',
  headquartersInstantChannel: '54000000-0000-4000-8000-000000000001',
  headquartersBatchChannel: '54000000-0000-4000-8000-000000000002',
  agentInstantChannel: '54000000-0000-4000-8000-000000000003',
  globalBatchPolicy: '55000000-0000-4000-8000-000000000001',
  merchantBatchPolicy: '55000000-0000-4000-8000-000000000002',
  globalManualRule: '56000000-0000-4000-8000-000000000001',
  globalIntervalRule: '56000000-0000-4000-8000-000000000002',
  globalOrderCountRule: '56000000-0000-4000-8000-000000000003',
  merchantManualRule: '56000000-0000-4000-8000-000000000004',
  merchantIntervalRule: '56000000-0000-4000-8000-000000000005',
  merchantOrderCountRule: '56000000-0000-4000-8000-000000000006',
  headquartersInstantPlan: '57000000-0000-4000-8000-000000000001',
  headquartersBatchPlan: '57000000-0000-4000-8000-000000000002',
  agentInstantPlan: '57000000-0000-4000-8000-000000000003',
  headquartersBinanceBot: '58000000-0000-4000-8000-000000000001',
  headquartersOkxBot: '58000000-0000-4000-8000-000000000002',
  agentBinanceBot: '58000000-0000-4000-8000-000000000003',
  headquartersBinanceGroup: '59000000-0000-4000-8000-000000000001',
  headquartersOkxGroup: '59000000-0000-4000-8000-000000000002',
  agentBinanceGroup: '59000000-0000-4000-8000-000000000003',
} as const

interface AlipayMockConfig {
  mockGateway?: string
  pfaParams: {
    alipayPublicKey: string
    appId: string
    gateway: string
    privateKey: string
    userId: string
  }
}

interface BinanceMockConfig {
  gateway: string
  settings: { apiKey: string; clientType: string; secretKey: string }
}

interface OkxMockConfig {
  gateway: string
  settings: { authorization: string; cookie: string }
}

async function main(): Promise<void> {
  assertLocalTarget()
  const masterKey = requireMasterKey()
  const [binance, okx, transfer, batch] = await Promise.all([
    request<BinanceMockConfig>('/api/mock/binance-c2c/config'),
    request<OkxMockConfig>('/api/mock/okx-c2c/config'),
    request<AlipayMockConfig>('/api/mock/alipay-transfer/config'),
    request<AlipayMockConfig>('/api/mock/alipay-batch/config'),
  ])
  const okxKeyPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
  const signaturePrivateKey = okxKeyPair.privateKey
    .export({ format: 'der', type: 'pkcs8' })
    .toString('base64')
  await request('/api/mock/okx-c2c/config', {
    method: 'PATCH',
    body: JSON.stringify({
      signaturePublicKey: okxKeyPair.publicKey
        .export({ format: 'der', type: 'spki' })
        .toString('base64'),
    }),
  })

  const dataSource = createMigrationDataSource()
  await dataSource.initialize()
  try {
    if (await dataSource.showMigrations()) {
      throw new Error('数据库仍有未执行迁移，请先运行 migrate 服务')
    }
    await dataSource.transaction((manager) =>
      seed(manager, masterKey, {
        binance,
        okx: { ...okx, signaturePrivateKey },
        transfer,
        batch,
      }),
    )
    const encryptedCredentials = await verifyEncryptedCredentials(dataSource, masterKey)
    const [summary] = (await dataSource.query(
      `SELECT
         (SELECT COUNT(*)::integer FROM tenant) AS tenants,
         (SELECT COUNT(*)::integer FROM merchant) AS merchants,
         (SELECT COUNT(*)::integer FROM payment_account) AS "paymentAccounts",
         (SELECT COUNT(*)::integer FROM merchant_payment_plan) AS "paymentPlans",
         (SELECT COUNT(*)::integer FROM telegram_group) AS "telegramGroups"`,
    )) as Array<Record<string, number>>
    process.stdout.write(`${JSON.stringify({ ...summary, encryptedCredentials })}\n`)
  } finally {
    await dataSource.destroy()
  }
}

async function verifyEncryptedCredentials(
  dataSource: DataSource,
  masterKey: string,
): Promise<number> {
  const rows = (await dataSource.query(
    `SELECT "credentialRef" AS reference FROM merchant_platform_credential
     UNION ALL SELECT "credentialRef" AS reference FROM payment_account
     UNION ALL SELECT "tokenRef" AS reference FROM telegram_bot`,
  )) as Array<{ reference: string }>
  if (rows.length !== 9) throw new Error(`测试凭据数量错误: ${rows.length}`)
  for (const { reference } of rows) {
    if (!reference.startsWith('enc://')) throw new Error('测试凭据未使用 enc:// 加密引用')
    if (!decryptCredential(reference.slice('enc://'.length), masterKey)) {
      throw new Error('测试凭据解密结果为空')
    }
  }
  return rows.length
}

async function seed(
  manager: EntityManager,
  masterKey: string,
  config: {
    batch: AlipayMockConfig
    binance: BinanceMockConfig
    okx: OkxMockConfig & { signaturePrivateKey: string }
    transfer: AlipayMockConfig
  },
): Promise<void> {
  const encrypt = (value: Record<string, unknown>) =>
    `enc://${encryptCredential(JSON.stringify(value), masterKey)}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  await manager.query(
    `INSERT INTO tenant (id, type, code, name, status, timezone, "systemLocked")
     VALUES ($1, 'AGENT', 'AG_TEST', '测试代理商', 'active', 'Asia/Shanghai', false)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status`,
    [ids.agentTenant],
  )
  await manager.query(
    `INSERT INTO merchant
       (id, "tenantId", code, name, platform, "externalMerchantId", "apiBaseUrl", status,
        "automaticPaymentEnabled", "automaticPaymentExecutionMode")
     VALUES
       ($1, $4, 'MCH_HQ_BN', '总部币安自动付款商家', 'BINANCE', 'mock-hq-binance', $6, 'active', true, 'INSTANT'),
       ($2, $4, 'MCH_HQ_OKX', '总部欧易批次付款商家', 'OKX', 'mock-hq-okx', $7, 'active', true, 'BATCH'),
       ($3, $5, 'MCH_AG_BN', '代理商币安自动付款商家', 'BINANCE', 'mock-agent-binance', $6, 'active', true, 'INSTANT')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, "externalMerchantId" = EXCLUDED."externalMerchantId",
       "apiBaseUrl" = EXCLUDED."apiBaseUrl", status = EXCLUDED.status,
       "automaticPaymentEnabled" = EXCLUDED."automaticPaymentEnabled",
       "automaticPaymentExecutionMode" = EXCLUDED."automaticPaymentExecutionMode"`,
    [
      ids.headquartersBinanceMerchant,
      ids.headquartersOkxMerchant,
      ids.agentBinanceMerchant,
      tenantId,
      ids.agentTenant,
      config.binance.gateway,
      config.okx.gateway,
    ],
  )
  await upsertMerchantCredential(manager, {
    id: '5a000000-0000-4000-8000-000000000001',
    tenantId,
    merchantId: ids.headquartersBinanceMerchant,
    platform: 'BINANCE',
    credentialRef: encrypt({
      apiKey: config.binance.settings.apiKey,
      secretKey: config.binance.settings.secretKey,
    }),
    authMode: 'API_KEY',
    apiBaseUrl: config.binance.gateway,
    clientType: config.binance.settings.clientType,
  })
  await upsertMerchantCredential(manager, {
    id: '5a000000-0000-4000-8000-000000000002',
    tenantId,
    merchantId: ids.headquartersOkxMerchant,
    platform: 'OKX',
    credentialRef: encrypt({
      authorization: config.okx.settings.authorization,
      cookie: config.okx.settings.cookie,
      signaturePrivateKey: config.okx.signaturePrivateKey,
      skipPaymentProofUpload: true,
    }),
    authMode: 'WEB_COOKIE',
    apiBaseUrl: config.okx.gateway,
    clientType: null,
  })
  await upsertMerchantCredential(manager, {
    id: '5a000000-0000-4000-8000-000000000003',
    tenantId: ids.agentTenant,
    merchantId: ids.agentBinanceMerchant,
    platform: 'BINANCE',
    credentialRef: encrypt({
      apiKey: config.binance.settings.apiKey,
      secretKey: config.binance.settings.secretKey,
    }),
    authMode: 'API_KEY',
    apiBaseUrl: config.binance.gateway,
    clientType: config.binance.settings.clientType,
  })

  await upsertPaymentAccount(manager, {
    id: ids.headquartersInstantAccount,
    tenantId,
    code: 'PAYACC_HQ_INSTANT',
    name: '总部支付宝商家转账账号',
    credential: config.transfer,
    masterKey,
  })
  await upsertPaymentAccount(manager, {
    id: ids.headquartersBatchAccount,
    tenantId,
    code: 'PAYACC_HQ_BATCH',
    name: '总部支付宝批量有密账号',
    credential: config.batch,
    masterKey,
  })
  await upsertPaymentAccount(manager, {
    id: ids.agentInstantAccount,
    tenantId: ids.agentTenant,
    code: 'PAYACC_AG_INSTANT',
    name: '代理商支付宝商家转账账号',
    credential: config.transfer,
    masterKey,
  })
  await manager.query(
    `INSERT INTO payment_account_channel
       (id, "paymentAccountId", "channelId", "minimumAmount", "maximumAmount", "concurrencyLimit", status)
     VALUES
       ($1, $4, $7, 0.01, 50000, 5, 'active'),
       ($2, $5, $8, 0.01, 500000, 1, 'active'),
       ($3, $6, $7, 0.01, 50000, 5, 'active')
     ON CONFLICT (id) DO UPDATE SET
       "minimumAmount" = EXCLUDED."minimumAmount", "maximumAmount" = EXCLUDED."maximumAmount",
       "concurrencyLimit" = EXCLUDED."concurrencyLimit", status = EXCLUDED.status`,
    [
      ids.headquartersInstantChannel,
      ids.headquartersBatchChannel,
      ids.agentInstantChannel,
      ids.headquartersInstantAccount,
      ids.headquartersBatchAccount,
      ids.agentInstantAccount,
      C2C_FOUNDATION_IDS.alipayMerchantTransferChannel,
      C2C_FOUNDATION_IDS.alipayBatchChannel,
    ],
  )
  await manager.query(
    `INSERT INTO payment_batch_policy (id, "tenantId", "scopeType", "merchantId", code, name, status)
     VALUES
       ($1, $3, 'GLOBAL', NULL, 'BATCH_GLOBAL', '总部全局批次策略', 'active'),
       ($2, $3, 'MERCHANT', $4, 'BATCH_OKX', '欧易商家批次策略', 'active')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status`,
    [ids.globalBatchPolicy, ids.merchantBatchPolicy, tenantId, ids.headquartersOkxMerchant],
  )
  await manager.query(
    `INSERT INTO payment_batch_policy_rule
       (id, "tenantId", "policyId", "ruleType", "intervalSeconds", "orderCount", status)
     VALUES
       ($1, $7, $8, 'MANUAL', NULL, NULL, 'active'),
       ($2, $7, $8, 'INTERVAL', 300, NULL, 'active'),
       ($3, $7, $8, 'ORDER_COUNT', NULL, 10, 'active'),
       ($4, $7, $9, 'MANUAL', NULL, NULL, 'active'),
       ($5, $7, $9, 'INTERVAL', 60, NULL, 'active'),
       ($6, $7, $9, 'ORDER_COUNT', NULL, 2, 'active')
     ON CONFLICT (id) DO UPDATE SET
       "intervalSeconds" = EXCLUDED."intervalSeconds", "orderCount" = EXCLUDED."orderCount",
       status = EXCLUDED.status`,
    [
      ids.globalManualRule,
      ids.globalIntervalRule,
      ids.globalOrderCountRule,
      ids.merchantManualRule,
      ids.merchantIntervalRule,
      ids.merchantOrderCountRule,
      tenantId,
      ids.globalBatchPolicy,
      ids.merchantBatchPolicy,
    ],
  )
  await manager.query(
    `INSERT INTO merchant_payment_plan
       (id, "tenantId", "merchantId", scene, currency, "paymentAccountId",
        "paymentAccountChannelId", "batchPolicyId", priority, weight, status)
     VALUES
       ($1, $7, $4, 'C2C_BUY', 'CNY', $9, $12, NULL, 10, 100, 'active'),
       ($2, $7, $5, 'C2C_BUY', 'CNY', $10, $13, $15, 10, 100, 'active'),
       ($3, $8, $6, 'C2C_BUY', 'CNY', $11, $14, NULL, 10, 100, 'active')
     ON CONFLICT (id) DO UPDATE SET
       "paymentAccountId" = EXCLUDED."paymentAccountId",
       "paymentAccountChannelId" = EXCLUDED."paymentAccountChannelId",
       "batchPolicyId" = EXCLUDED."batchPolicyId", priority = EXCLUDED.priority,
       weight = EXCLUDED.weight, status = EXCLUDED.status`,
    [
      ids.headquartersInstantPlan,
      ids.headquartersBatchPlan,
      ids.agentInstantPlan,
      ids.headquartersBinanceMerchant,
      ids.headquartersOkxMerchant,
      ids.agentBinanceMerchant,
      tenantId,
      ids.agentTenant,
      ids.headquartersInstantAccount,
      ids.headquartersBatchAccount,
      ids.agentInstantAccount,
      ids.headquartersInstantChannel,
      ids.headquartersBatchChannel,
      ids.agentInstantChannel,
      ids.merchantBatchPolicy,
    ],
  )
  await seedTelegram(manager, masterKey)
}

async function upsertMerchantCredential(
  manager: EntityManager,
  input: {
    apiBaseUrl: string
    authMode: string
    clientType: string | null
    credentialRef: string
    id: string
    merchantId: string
    platform: string
    tenantId: string
  },
): Promise<void> {
  await manager.query(
    `INSERT INTO merchant_platform_credential
       (id, "tenantId", "merchantId", platform, version, "credentialRef", "authMode",
        "apiBaseUrl", "clientType", "requestTimeoutMs", status)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7, $8, 5000, 'active')
     ON CONFLICT (id) DO UPDATE SET
       "credentialRef" = EXCLUDED."credentialRef", "apiBaseUrl" = EXCLUDED."apiBaseUrl",
       "clientType" = EXCLUDED."clientType", "requestTimeoutMs" = EXCLUDED."requestTimeoutMs",
       status = EXCLUDED.status`,
    [
      input.id,
      input.tenantId,
      input.merchantId,
      input.platform,
      input.credentialRef,
      input.authMode,
      input.apiBaseUrl,
      input.clientType,
    ],
  )
}

async function upsertPaymentAccount(
  manager: EntityManager,
  input: {
    code: string
    credential: AlipayMockConfig
    id: string
    masterKey: string
    name: string
    tenantId: string
  },
): Promise<void> {
  const credential = {
    authMode: 'KEY',
    appId: input.credential.pfaParams.appId,
    privateKey: input.credential.pfaParams.privateKey,
    alipayPublicKey: input.credential.pfaParams.alipayPublicKey,
    gateway: input.credential.mockGateway ?? input.credential.pfaParams.gateway,
  }
  await manager.query(
    `INSERT INTO payment_account
       (id, "tenantId", "platformId", code, name, "externalAccountId", "credentialRef",
        "credentialAuthMode", "credentialAppId", "credentialGateway", "credentialUpdatedAt", status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'KEY', $8, $9, now(), 'active')
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, "credentialRef" = EXCLUDED."credentialRef",
       "credentialAuthMode" = EXCLUDED."credentialAuthMode",
       "credentialAppId" = EXCLUDED."credentialAppId",
       "credentialGateway" = EXCLUDED."credentialGateway",
       "credentialUpdatedAt" = EXCLUDED."credentialUpdatedAt", status = EXCLUDED.status`,
    [
      input.id,
      input.tenantId,
      C2C_FOUNDATION_IDS.alipayPlatform,
      input.code,
      input.name,
      input.credential.pfaParams.userId,
      `enc://${encryptCredential(JSON.stringify(credential), input.masterKey)}`,
      credential.appId,
      credential.gateway,
    ],
  )
}

async function seedTelegram(manager: EntityManager, masterKey: string): Promise<void> {
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const tokenRef = (name: string) =>
    `enc://${encryptCredential(`000000000:${name}-local-test-token`, masterKey)}`
  await manager.query(
    `INSERT INTO telegram_bot
       (id, "tenantId", code, name, "botType", "tokenRef", capabilities, status, "runtimeEnabled")
     VALUES
       ($1, $4, 'BOT_HQ_BN', '总部币安支付机器人', 'PAYMENT', $6, ARRAY['NOTIFY'], 'active', false),
       ($2, $4, 'BOT_HQ_OKX', '总部欧易支付机器人', 'PAYMENT', $7, ARRAY['NOTIFY'], 'active', false),
       ($3, $5, 'BOT_AG_BN', '代理商币安支付机器人', 'PAYMENT', $8, ARRAY['NOTIFY'], 'active', false)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, "tokenRef" = EXCLUDED."tokenRef", status = EXCLUDED.status,
       "runtimeEnabled" = EXCLUDED."runtimeEnabled"`,
    [
      ids.headquartersBinanceBot,
      ids.headquartersOkxBot,
      ids.agentBinanceBot,
      tenantId,
      ids.agentTenant,
      tokenRef('hq-binance'),
      tokenRef('hq-okx'),
      tokenRef('agent-binance'),
    ],
  )
  await manager.query(
    `INSERT INTO telegram_group
       (id, "tenantId", "botId", "merchantId", name, "chatId", "chatType", "paymentScene",
        capabilities, "notificationEvents", "notificationsEnabled", "bindingState", "verifiedAt")
     VALUES
       ($1, $7, $4, $9, '总部币安通知群', '-91001', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, false, 'ACTIVE', now()),
       ($2, $7, $5, $10, '总部欧易通知群', '-91002', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, false, 'ACTIVE', now()),
       ($3, $8, $6, $11, '代理商币安通知群', '-92001', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, false, 'ACTIVE', now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, "chatId" = EXCLUDED."chatId",
       "notificationsEnabled" = EXCLUDED."notificationsEnabled",
       "bindingState" = EXCLUDED."bindingState"`,
    [
      ids.headquartersBinanceGroup,
      ids.headquartersOkxGroup,
      ids.agentBinanceGroup,
      ids.headquartersBinanceBot,
      ids.headquartersOkxBot,
      ids.agentBinanceBot,
      tenantId,
      ids.agentTenant,
      ids.headquartersBinanceMerchant,
      ids.headquartersOkxMerchant,
      ids.agentBinanceMerchant,
      ['ORDER_DISCOVERED', 'PAYMENT_STATUS', 'BATCH_STATUS', 'EXCEPTION'],
    ],
  )
}

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MOCK_ORIGIN}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  })
  if (!response.ok) throw new Error(`Mock 请求失败: ${path} (${response.status})`)
  return (await response.json()) as T
}

function assertLocalTarget(): void {
  if (process.env.NODE_ENV === 'production') throw new Error('禁止在生产环境运行本地测试数据脚本')
  const host = process.env.C2C_POSTGRES_HOST ?? 'localhost'
  if (host !== 'localhost' && host !== '127.0.0.1') {
    throw new Error('本地测试数据脚本只允许连接 localhost 或 127.0.0.1')
  }
}

function requireMasterKey(): string {
  const value = process.env.C2C_CREDENTIAL_MASTER_KEY?.trim()
  if (!value) throw new Error('C2C_CREDENTIAL_MASTER_KEY 未配置')
  return value
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
