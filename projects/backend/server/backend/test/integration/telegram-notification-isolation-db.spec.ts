/// <reference types="jest" />

import {
  MerchantOrderEntity,
  PaymentBatchEntity,
  PaymentOrderEntity,
  TelegramBotEntity,
  TelegramGroupEntity,
} from '@/apps/admin/database'
import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPaymentRouting } from '@/apps/admin/database/migrations/c2c-payment-routing.migration'
import { migrateC2cMerchantPlatformCredentials } from '@/apps/admin/database/migrations/c2c-merchant-platform-credentials.migration'
import { migrateC2cMerchantOrders } from '@/apps/admin/database/migrations/c2c-merchant-orders.migration'
import { migrateC2cPaymentBatches } from '@/apps/admin/database/migrations/c2c-payment-batches.migration'
import { migrateC2cMerchantOrderAppeals } from '@/apps/admin/database/migrations/c2c-merchant-order-appeals.migration'
import { migrateC2cMerchantAccountOperations } from '@/apps/admin/database/migrations/c2c-merchant-account-operations.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateTelegramBotRuntime } from '@/apps/admin/database/migrations/c2c-telegram-bot-runtime.migration'
import { migrateC2cPaymentBatchPolicies } from '@/apps/admin/database/migrations/c2c-payment-batch-policies.migration'
import { migrateC2cPlatformConfirmationControl } from '@/apps/admin/database/migrations/c2c-platform-confirmation-control.migration'
import { migrateC2cFullProviderParity } from '@/apps/admin/database/migrations/c2c-full-provider-parity.migration'
import { migrateC2cPaidNotificationCapability } from '@/apps/admin/database/migrations/c2c-paid-notification-capability.migration'
import { migrateC2cPaymentPlatformStateSeparation } from '@/apps/admin/database/migrations/c2c-payment-platform-state-separation.migration'
import type { TelegramApiClient } from '@/apps/admin/modules/telegram/telegram-api.client'
import {
  TelegramNotificationEvent,
  TelegramNotificationService,
} from '@/apps/admin/modules/telegram/telegram-notification.service'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

const ids = {
  tenantA: C2C_FOUNDATION_IDS.headquartersTenant,
  tenantB: '41000000-0000-4000-8000-000000000002',
  merchantA: '42000000-0000-4000-8000-000000000001',
  merchantB: '42000000-0000-4000-8000-000000000002',
  merchantC: '42000000-0000-4000-8000-000000000003',
  botA: '43000000-0000-4000-8000-000000000001',
  botB: '43000000-0000-4000-8000-000000000002',
  botC: '43000000-0000-4000-8000-000000000003',
  groupA: '44000000-0000-4000-8000-000000000001',
  groupB: '44000000-0000-4000-8000-000000000002',
  groupC: '44000000-0000-4000-8000-000000000003',
  orderA: '45000000-0000-4000-8000-000000000001',
  orderB: '45000000-0000-4000-8000-000000000002',
  orderC: '45000000-0000-4000-8000-000000000003',
  paymentA: '46000000-0000-4000-8000-000000000001',
  paymentB: '46000000-0000-4000-8000-000000000002',
  paymentC: '46000000-0000-4000-8000-000000000003',
} as const

describe('Telegram notification database isolation', () => {
  const { postgres } = developmentConfig.admin
  const schema = `telegram_notification_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  const sendMessage = jest
    .fn<
      ReturnType<TelegramApiClient['sendMessage']>,
      Parameters<TelegramApiClient['sendMessage']>
    >()
    .mockResolvedValue({ messageId: 1 })

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      logging: false,
      entities: [
        MerchantOrderEntity,
        PaymentOrderEntity,
        PaymentBatchEntity,
        TelegramBotEntity,
        TelegramGroupEntity,
      ],
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await dataSource.transaction(async (manager) => {
      await migrateSystemFoundation(manager)
      await migrateC2cBusinessFoundation(manager)
      await migrateC2cPaymentOrders(manager)
      await migrateC2cPaymentRouting(manager)
      await migrateC2cMerchantPlatformCredentials(manager)
      await migrateC2cMerchantOrders(manager)
      await migrateC2cMerchantAccountOperations(manager)
      await migrateC2cPaymentBatches(manager)
      await migrateC2cMerchantOrderAppeals(manager)
      await migrateTelegramAdministration(manager)
      await migrateTelegramBotRuntime(manager)
      await migrateC2cPaymentBatchPolicies(manager)
      await migrateC2cPlatformConfirmationControl({ query: manager.query.bind(manager) })
      await migrateC2cFullProviderParity(manager)
      await migrateC2cPaymentPlatformStateSeparation({ query: manager.query.bind(manager) })
    })
    await seedScopes(dataSource)
    await dataSource.transaction((manager) => migrateC2cPaidNotificationCapability(manager))
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  beforeEach(() => sendMessage.mockClear())

  it('routes each merchant order and payment notification only to its own group and bot', async () => {
    const service = new TelegramNotificationService(
      dataSource.getRepository(TelegramGroupEntity),
      dataSource.getRepository(TelegramBotEntity),
      dataSource.getRepository(MerchantOrderEntity),
      dataSource.getRepository(PaymentOrderEntity),
      dataSource.getRepository(PaymentBatchEntity),
      { sendMessage } as unknown as TelegramApiClient,
    )

    await notifyMerchant(service, ids.tenantA, ids.merchantA, ids.orderA, ids.paymentA)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls.map(([message]) => message.chatId)).toEqual(['-10001'])
    expect(sendMessage.mock.calls.map(([message]) => message.tokenRef)).toEqual(['env://TG_TEST_A'])
    expect(sendMessage.mock.calls.map(([message]) => message.text).join('\n')).toContain('PAY-A')
    expect(sendMessage.mock.calls.map(([message]) => message.text).join('\n')).not.toContain(
      'ORDER-B',
    )
    expect(sendMessage.mock.calls.map(([message]) => message.text).join('\n')).not.toContain(
      'ORDER-C',
    )

    sendMessage.mockClear()
    await notifyMerchant(service, ids.tenantA, ids.merchantB, ids.orderB, ids.paymentB)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls.map(([message]) => [message.chatId, message.tokenRef])).toEqual([
      ['-10002', 'env://TG_TEST_B'],
    ])

    sendMessage.mockClear()
    await notifyMerchant(service, ids.tenantB, ids.merchantC, ids.orderC, ids.paymentC)
    expect(sendMessage).toHaveBeenCalledTimes(1)
    expect(sendMessage.mock.calls.map(([message]) => [message.chatId, message.tokenRef])).toEqual([
      ['-20001', 'env://TG_TEST_C'],
    ])
  })
})

async function notifyMerchant(
  service: TelegramNotificationService,
  tenantId: string,
  merchantId: string,
  orderId: string,
  paymentOrderId: string,
): Promise<void> {
  await service.notifyOrderDiscovered({ tenantId, merchantId, orderIds: [orderId] })
  await service.notifyPaymentStatus({
    tenantId,
    merchantId,
    paymentOrderId,
    status: 'SUCCESS',
  })
}

async function seedScopes(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    `INSERT INTO tenant (id, type, code, name, status)
     VALUES ($1, 'AGENT', 'TG_AGENT', 'Telegram isolation agent', 'active')`,
    [ids.tenantB],
  )
  await dataSource.query(
    `INSERT INTO merchant (id, "tenantId", code, name, platform, status, "apiBaseUrl")
     VALUES
       ($1, $4, 'TG_MERCHANT_A', 'Telegram merchant A', 'BINANCE', 'active', 'https://api.binance.com'),
       ($2, $4, 'TG_MERCHANT_B', 'Telegram merchant B', 'BINANCE', 'active', 'https://api.binance.com'),
       ($3, $5, 'TG_MERCHANT_C', 'Telegram merchant C', 'OKX', 'active', 'https://www.okx.com')`,
    [ids.merchantA, ids.merchantB, ids.merchantC, ids.tenantA, ids.tenantB],
  )
  await dataSource.query(
    `INSERT INTO telegram_bot
       (id, "tenantId", code, name, "botType", "tokenRef", capabilities, status, "runtimeEnabled")
     VALUES
       ($1, $4, 'TG_BOT_A', 'Telegram bot A', 'PAYMENT', 'env://TG_TEST_A', ARRAY['NOTIFY'], 'active', false),
       ($2, $4, 'TG_BOT_B', 'Telegram bot B', 'PAYMENT', 'env://TG_TEST_B', ARRAY['NOTIFY'], 'active', false),
       ($3, $5, 'TG_BOT_C', 'Telegram bot C', 'PAYMENT', 'env://TG_TEST_C', ARRAY['NOTIFY'], 'active', false)`,
    [ids.botA, ids.botB, ids.botC, ids.tenantA, ids.tenantB],
  )
  await dataSource.query(
    `INSERT INTO telegram_group
       (id, "tenantId", "botId", "merchantId", name, "chatId", "chatType", "paymentScene",
        capabilities, "notificationEvents", "notificationsEnabled", "bindingState", "verifiedAt")
     VALUES
       ($1, $7, $4, $9, 'Group A', '-10001', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, true, 'ACTIVE', now()),
       ($2, $7, $5, $10, 'Group B', '-10002', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, true, 'ACTIVE', now()),
       ($3, $8, $6, $11, 'Group C', '-20001', 'supergroup', 'C2C_BUY', ARRAY['NOTIFY'], $12, true, 'ACTIVE', now())`,
    [
      ids.groupA,
      ids.groupB,
      ids.groupC,
      ids.botA,
      ids.botB,
      ids.botC,
      ids.tenantA,
      ids.tenantB,
      ids.merchantA,
      ids.merchantB,
      ids.merchantC,
      [TelegramNotificationEvent.ORDER_DISCOVERED, TelegramNotificationEvent.PAYMENT_STATUS],
    ],
  )
  await dataSource.query(
    `INSERT INTO merchant_order
       (id, "tenantId", "merchantId", platform, "platformOrderId", side, "platformStatus", status,
        asset, "assetAmount", "fiatCurrency", "fiatAmount", "payeeIdentity", "payeeName",
        "identityMatched", payable, "platformCreatedAt", "lastSyncedAt")
     VALUES
       ($1, $7, $4, 'BINANCE', 'ORDER-A', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT', 'USDT', 1, 'CNY', 10, 'a@example.com', 'A', true, true, now(), now()),
       ($2, $7, $5, 'BINANCE', 'ORDER-B', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT', 'USDT', 2, 'CNY', 20, 'b@example.com', 'B', true, true, now(), now()),
       ($3, $8, $6, 'OKX', 'ORDER-C', 'BUY', 'PENDING_PAYMENT', 'PENDING_PAYMENT', 'USDT', 3, 'CNY', 30, 'c@example.com', 'C', true, true, now(), now())`,
    [
      ids.orderA,
      ids.orderB,
      ids.orderC,
      ids.merchantA,
      ids.merchantB,
      ids.merchantC,
      ids.tenantA,
      ids.tenantB,
    ],
  )
  await dataSource.query(
    `INSERT INTO payment_order
       (id, "tenantId", "merchantId", "sourceType", "sourceBusinessNo", "paymentNo", amount,
        currency, "paymentMethod", "executionMode", "payeeIdentity", "payeeName", status)
     VALUES
       ($1, $7, $4, 'C2C_BUY', 'ORDER-A', 'PAY-A', 10, 'CNY', 'ALIPAY', 'INSTANT', 'a@example.com', 'A', 'SUCCESS'),
       ($2, $7, $5, 'C2C_BUY', 'ORDER-B', 'PAY-B', 20, 'CNY', 'ALIPAY', 'INSTANT', 'b@example.com', 'B', 'SUCCESS'),
       ($3, $8, $6, 'C2C_BUY', 'ORDER-C', 'PAY-C', 30, 'CNY', 'ALIPAY', 'INSTANT', 'c@example.com', 'C', 'SUCCESS')`,
    [
      ids.paymentA,
      ids.paymentB,
      ids.paymentC,
      ids.merchantA,
      ids.merchantB,
      ids.merchantC,
      ids.tenantA,
      ids.tenantB,
    ],
  )
}
