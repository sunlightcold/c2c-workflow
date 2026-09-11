/// <reference types="jest" />

import developmentConfig from '@/config/development'
import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import {
  C2C_FOUNDATION_IDS,
  migrateC2cBusinessFoundation,
} from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Telegram administration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `telegram_admin_test_${process.pid}_${Date.now()}`
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

  it('creates tenant-scoped Telegram administration tables and constraints idempotently', async () => {
    await migrateSystemFoundation(queryRunner.manager)
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateTelegramAdministration(queryRunner.manager)
    await migrateTelegramAdministration(queryRunner.manager)

    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform, status)
      VALUES (
        '00000000-0000-4000-8000-000000000020',
        '${C2C_FOUNDATION_IDS.headquartersTenant}',
        'telegram-merchant', 'Telegram merchant', 'BINANCE', 'active'
      )
    `)
    await queryRunner.query(`
      INSERT INTO telegram_bot (
        id, "tenantId", code, name, "botType", "tokenRef", capabilities, status
      ) VALUES (
        '00000000-0000-4000-8000-000000000030',
        '${C2C_FOUNDATION_IDS.headquartersTenant}',
        'PAY_MAIN', 'Main payment bot', 'PAYMENT', 'env://TELEGRAM_TOKEN',
        ARRAY['ORDER_QUERY', 'MANUAL_PAYMENT'], 'active'
      )
    `)
    await queryRunner.query(`
      INSERT INTO telegram_group (
        id, "tenantId", "botId", "merchantId", name, "chatId", "chatType",
        "paymentScene", capabilities, "bindingState", "verifiedAt"
      ) VALUES (
        '00000000-0000-4000-8000-000000000040',
        '${C2C_FOUNDATION_IDS.headquartersTenant}',
        '00000000-0000-4000-8000-000000000030',
        '00000000-0000-4000-8000-000000000020',
        'Payment group', '-1001234567890', 'supergroup', 'BOT_MANUAL',
        ARRAY['ORDER_QUERY'], 'ACTIVE', now()
      )
    `)

    const rows = (await queryRunner.query(`
      SELECT "merchantId", "paymentScene", "bindingState"
      FROM telegram_group
    `)) as Array<Record<string, unknown>>
    expect(rows).toEqual([
      {
        merchantId: '00000000-0000-4000-8000-000000000020',
        paymentScene: 'BOT_MANUAL',
        bindingState: 'ACTIVE',
      },
    ])
  })
})
