/// <reference types="jest" />

import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateTelegramInteractions } from '@/apps/admin/database/migrations/c2c-telegram-interactions.migration'
import { migrateTelegramBatchInteractions } from '@/apps/admin/database/migrations/c2c-telegram-batch-interactions.migration'
import { TelegramInteractionService } from '@/apps/admin/modules/telegram/telegram-interaction.service'
import { TelegramInteractionAction, TelegramInteractionState } from '@admin/database'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Telegram interaction database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `telegram_interaction_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({
      type: 'postgres',
      ...postgres,
      schema,
      synchronize: false,
      extra: { options: `-c search_path=${schema},public` },
    })
    await dataSource.initialize()
    await dataSource.transaction(async (manager) => {
      await migrateSystemFoundation(manager)
      await migrateC2cBusinessFoundation(manager)
      await migrateC2cPaymentOrders(manager)
      await migrateTelegramAdministration(manager)
      await migrateTelegramInteractions(manager)
      await migrateTelegramInteractions(manager)
      await migrateTelegramBatchInteractions(manager)
      await migrateTelegramBatchInteractions(manager)
    })
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('allows only one confirmation to acquire a pending interaction', async () => {
    const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
    const botId = '00000000-0000-4000-8000-000000000030'
    const merchantId = '00000000-0000-4000-8000-000000000020'
    const groupId = '00000000-0000-4000-8000-000000000040'
    const interactionId = '00000000-0000-4000-8000-000000000050'
    await dataSource.query(
      `INSERT INTO merchant (id, "tenantId", code, name, platform, status)
       VALUES ($1, $2, 'TG_MERCHANT', 'Telegram merchant', 'BINANCE', 'active')`,
      [merchantId, tenantId],
    )
    await dataSource.query(
      `INSERT INTO telegram_bot
       (id, "tenantId", code, name, "botType", "tokenRef", capabilities, status)
       VALUES ($1, $2, 'PAY_MAIN', 'Payment bot', 'PAYMENT', 'env://TG_TOKEN',
         ARRAY['MANUAL_PAYMENT'], 'active')`,
      [botId, tenantId],
    )
    await dataSource.query(
      `INSERT INTO telegram_group
       (id, "tenantId", "botId", "merchantId", name, "chatId", "chatType",
        "paymentScene", capabilities, "bindingState", "verifiedAt")
       VALUES ($1, $2, $3, $4, 'Payment group', '-1001', 'supergroup', 'BOT_MANUAL',
         ARRAY['MANUAL_PAYMENT'], 'ACTIVE', now())`,
      [groupId, tenantId, botId, merchantId],
    )
    await dataSource.query(
      `INSERT INTO telegram_interaction_context
       (id, "tenantId", "botId", "groupId", "chatId", "telegramUserId", "sourceMessageId",
        action, payload, state, "expiresAt")
       VALUES ($1, $2, $3, $4, '-1001', '88', 9, 'CREATE_MANUAL_PAYMENTS',
         '{"payments":[]}'::jsonb, 'PENDING', now() + interval '10 minutes')`,
      [interactionId, tenantId, botId, groupId],
    )
    const interactions = {}
    const service = new TelegramInteractionService(dataSource, interactions as never)
    const input = {
      id: interactionId,
      botId,
      chatId: '-1001',
      telegramUserId: '88',
      action: TelegramInteractionAction.CREATE_MANUAL_PAYMENTS,
    }

    await expect(service.acquire(input)).resolves.toMatchObject({
      id: interactionId,
      state: TelegramInteractionState.SUBMITTING,
    })
    await expect(service.acquire(input)).resolves.toBeNull()
  })
})
