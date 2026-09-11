/// <reference types="jest" />

import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateTelegramUpdateInbox } from '@/apps/admin/database/migrations/c2c-telegram-update-inbox.migration'
import { TelegramUpdateProcessorService } from '@/apps/admin/modules/telegram/telegram-update-processor.service'
import { TelegramUpdateStatus } from '@admin/database'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Telegram update processor database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `telegram_processor_test_${process.pid}_${Date.now()}`
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
      await migrateTelegramUpdateInbox(manager)
    })
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('claims and completes one received update using the database state boundary', async () => {
    await dataSource.query(
      `INSERT INTO telegram_bot
       (id, "tenantId", code, name, "botType", "tokenRef", "webhookSecretRef", capabilities, status)
       VALUES ($1, $2, 'PAY_MAIN', 'Payment bot', 'PAYMENT', 'env://TG_TOKEN',
         'env://TG_SECRET', ARRAY['ORDER_QUERY'], 'active')`,
      ['00000000-0000-4000-8000-000000000030', C2C_FOUNDATION_IDS.headquartersTenant],
    )
    await dataSource.query(
      `INSERT INTO telegram_update_event
       (id, "tenantId", "botId", "updateId", payload, status)
       VALUES ($1, $2, $3, 101, '{"update_id":101}'::jsonb, 'RECEIVED')`,
      [
        '00000000-0000-4000-8000-000000000031',
        C2C_FOUNDATION_IDS.headquartersTenant,
        '00000000-0000-4000-8000-000000000030',
      ],
    )
    const runtime = { handle: jest.fn().mockResolvedValue(undefined) }
    const processor = new TelegramUpdateProcessorService(dataSource, runtime as never)

    await expect(processor.processNext()).resolves.toBe(true)
    await expect(
      dataSource.query(
        `SELECT status, "lastError" FROM telegram_update_event WHERE "updateId" = 101`,
      ),
    ).resolves.toEqual([{ status: TelegramUpdateStatus.COMPLETED, lastError: null }])
    await expect(processor.processNext()).resolves.toBe(false)
    await expect(
      dataSource.query(
        `SELECT status, "lastError" FROM telegram_update_event WHERE "updateId" = 101`,
      ),
    ).resolves.toEqual([{ status: TelegramUpdateStatus.COMPLETED, lastError: null }])
    expect(runtime.handle).toHaveBeenCalledTimes(1)
  })
})
