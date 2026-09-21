/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateTelegramAdministration } from '@/apps/admin/database/migrations/c2c-telegram-administration.migration'
import { C2cTelegramIdentities1789018000000 } from '@/apps/admin/database/migrations/c2c-telegram-identities.migration'
import { migrateC2cTelegramOtc } from '@/apps/admin/database/migrations/c2c-telegram-otc.migration'
import { migrateSystemFoundation } from '@/apps/admin/database/migrations/system-foundation.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C Telegram OTC migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_telegram_otc_test_${process.pid}_${Date.now()}`
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

  it('grants OTC configuration only to existing admin members and stays idempotent', async () => {
    await migrateSystemFoundation(queryRunner.manager)
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateTelegramAdministration(queryRunner.manager)
    await new C2cTelegramIdentities1789018000000().up(queryRunner)
    await queryRunner.query(`
      INSERT INTO merchant (id, "tenantId", code, name, platform, status)
      SELECT
        '00000000-0000-4000-8000-000000000120', id,
        'telegram-otc-merchant', 'Telegram OTC merchant', 'BINANCE', 'active'
      FROM tenant
      ORDER BY "createdAt"
      LIMIT 1
    `)
    await queryRunner.query(`
      INSERT INTO telegram_bot (
        id, "tenantId", code, name, "botType", "tokenRef", capabilities, status
      )
      SELECT
        '00000000-0000-4000-8000-000000000130', "tenantId",
        'OTC_PAYMENT', 'OTC payment bot', 'PAYMENT', 'env://TELEGRAM_TOKEN',
        ARRAY['ORDER_QUERY'], 'active'
      FROM merchant
      WHERE id = '00000000-0000-4000-8000-000000000120'
    `)
    await queryRunner.query(`
      INSERT INTO telegram_group (
        id, "tenantId", "botId", "merchantId", name, "chatId", "chatType",
        "paymentScene", capabilities, "bindingState", "verifiedAt"
      )
      SELECT
        '00000000-0000-4000-8000-000000000140', "tenantId",
        '00000000-0000-4000-8000-000000000130', id,
        'OTC group', '-1001234567890', 'supergroup', 'C2C_BUY',
        ARRAY['ORDER_QUERY'], 'ACTIVE', now()
      FROM merchant
      WHERE id = '00000000-0000-4000-8000-000000000120'
    `)
    await queryRunner.query(`
      INSERT INTO telegram_group_member (
        "tenantId", "groupId", "telegramUserId", role, capabilities, status
      )
      SELECT groups."tenantId", groups.id, member."telegramUserId", member.role,
             ARRAY['ORDER_QUERY'], 'active'
      FROM telegram_group AS groups
      CROSS JOIN (VALUES
        ('101', 'ADMIN'),
        ('102', 'OPERATOR'),
        ('103', 'VIEWER')
      ) AS member("telegramUserId", role)
      WHERE groups.id = '00000000-0000-4000-8000-000000000140'
    `)

    await migrateC2cTelegramOtc(queryRunner.manager)
    await migrateC2cTelegramOtc(queryRunner.manager)

    const members = (await queryRunner.query(`
      SELECT role,
             cardinality(array_positions(capabilities, 'OTC_CONFIG_MANAGE')) AS count
      FROM telegram_group_member
      ORDER BY role
    `)) as Array<{ count: number; role: string }>
    expect(members).toEqual([
      { role: 'ADMIN', count: 1 },
      { role: 'OPERATOR', count: 0 },
      { role: 'VIEWER', count: 0 },
    ])

    const [scope] = (await queryRunner.query(`
      SELECT
        cardinality(array_positions(bot.capabilities, 'OTC_CONFIG_MANAGE')) AS "botCount",
        cardinality(array_positions(groups.capabilities, 'OTC_CONFIG_MANAGE')) AS "groupCount"
      FROM telegram_bot AS bot
      JOIN telegram_group AS groups ON groups."botId" = bot.id
    `)) as Array<{ botCount: number; groupCount: number }>
    expect(scope).toEqual({ botCount: 1, groupCount: 1 })
  })
})
