/// <reference types="jest" />

import developmentConfig from '@/config/development'
import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateTelegramUpdateInbox } from '@/apps/admin/database/migrations/c2c-telegram-update-inbox.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Telegram update inbox database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `telegram_inbox_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({ type: 'postgres', ...postgres, synchronize: false })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)
    dataSource = new DataSource({ type: 'postgres', ...postgres, schema, synchronize: false })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`)
  })

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction()
    if (queryRunner && !queryRunner.isReleased) await queryRunner.release()
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('persists one event per bot and update ID across repeated deployment', async () => {
    await migrateSystemFoundation(queryRunner.manager)
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateTelegramAdministration(queryRunner.manager)
    await migrateTelegramUpdateInbox(queryRunner.manager)
    await migrateTelegramUpdateInbox(queryRunner.manager)
    await queryRunner.query(
      `INSERT INTO telegram_bot
       (id, "tenantId", code, name, "botType", "tokenRef", "webhookSecretRef", capabilities, status)
       VALUES ($1, $2, 'PAY_MAIN', 'Pay bot', 'PAYMENT', 'env://TG_TOKEN', 'env://TG_SECRET',
         ARRAY['ALIPAY_BATCH_PAYMENT'], 'active')`,
      ['00000000-0000-4000-8000-000000000030', C2C_FOUNDATION_IDS.headquartersTenant],
    )
    await queryRunner.query(
      `INSERT INTO telegram_update_event
       ("tenantId", "botId", "updateId", payload, status)
       VALUES ($1, $2, 99, '{"update_id":99}'::jsonb, 'RECEIVED')`,
      [C2C_FOUNDATION_IDS.headquartersTenant, '00000000-0000-4000-8000-000000000030'],
    )
    await expect(
      queryRunner.query(
        `INSERT INTO telegram_update_event
         ("tenantId", "botId", "updateId", payload, status)
         VALUES ($1, $2, 99, '{}'::jsonb, 'RECEIVED')`,
        [C2C_FOUNDATION_IDS.headquartersTenant, '00000000-0000-4000-8000-000000000030'],
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } })
  })
})
