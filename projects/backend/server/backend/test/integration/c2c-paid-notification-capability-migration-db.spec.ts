/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaidNotificationCapability } from '@/apps/admin/database/migrations/c2c-paid-notification-capability.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C paid notification capability migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_paid_notification_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

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
    })
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

  it('enables the capability for existing payment bots and groups idempotently', async () => {
    await migrateSystemFoundation(queryRunner.manager)
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateTelegramAdministration(queryRunner.manager)
    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform, status)
      SELECT
        '00000000-0000-4000-8000-000000000020', id,
        'paid-notification-merchant', 'Paid notification merchant', 'BINANCE', 'active'
      FROM tenant
      ORDER BY "createdAt"
      LIMIT 1
    `)
    await queryRunner.query(`
      INSERT INTO telegram_bot (
        id, "tenantId", code, name, "botType", "tokenRef", capabilities, status
      )
      SELECT
        '00000000-0000-4000-8000-000000000030', "tenantId",
        'PAY_MAIN', 'Main payment bot', 'PAYMENT', 'env://TELEGRAM_TOKEN',
        ARRAY['ORDER_QUERY'], 'active'
      FROM merchant
      WHERE id = '00000000-0000-4000-8000-000000000020'
    `)
    await queryRunner.query(`
      INSERT INTO telegram_group (
        id, "tenantId", "botId", "merchantId", name, "chatId", "chatType",
        "paymentScene", capabilities, "bindingState", "verifiedAt"
      )
      SELECT
        '00000000-0000-4000-8000-000000000040', "tenantId",
        '00000000-0000-4000-8000-000000000030', id,
        'Payment group', '-1001234567890', 'supergroup', 'C2C_BUY',
        ARRAY['ORDER_QUERY'], 'ACTIVE', now()
      FROM merchant
      WHERE id = '00000000-0000-4000-8000-000000000020'
    `)

    await migrateC2cPaidNotificationCapability(queryRunner.manager)
    await migrateC2cPaidNotificationCapability(queryRunner.manager)

    const [row] = (await queryRunner.query(`
      SELECT
        cardinality(array_positions(bot.capabilities, 'C2C_PAID_NOTIFICATION')) AS "botCount",
        cardinality(array_positions(groups.capabilities, 'C2C_PAID_NOTIFICATION')) AS "groupCount"
      FROM telegram_bot AS bot
      JOIN telegram_group AS groups ON groups."botId" = bot.id
    `)) as Array<{ botCount: number; groupCount: number }>

    expect(row).toEqual({ botCount: 1, groupCount: 1 })
  })
})
