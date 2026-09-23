/// <reference types="jest" />

import { migrateC2cTelegramReviewNotifications } from '@/apps/admin/database/migrations/c2c-telegram-review-notifications.migration'
import { TypeOrmC2cOrderSyncStore } from '@/apps/admin/modules/c2c-order/typeorm-c2c-order-sync.store'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C Telegram review notification migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_tg_review_notice_${process.pid}_${Date.now()}`
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
    await queryRunner.query(`
      CREATE TABLE merchant_order (
        id uuid PRIMARY KEY,
        "tenantId" uuid,
        "merchantId" uuid,
        "platformOrderId" varchar(128),
        "platformCreatedAt" timestamptz,
        status varchar(32),
        "identityMatched" boolean,
        payable boolean,
        "kycStatus" varchar(32),
        "paymentMethod" varchar(32),
        "identityName" varchar(128),
        "payeeName" varchar(128),
        "payeeIdentity" varchar(255),
        "paymentDeadline" timestamptz
      );
      CREATE TABLE payment_order (
        "tenantId" uuid, "merchantId" uuid, "sourceType" varchar(32), "sourceBusinessNo" varchar(128)
      );
      CREATE TABLE telegram_bot (
        id uuid PRIMARY KEY, "tenantId" uuid, status varchar(16), capabilities varchar[]
      );
      CREATE TABLE telegram_group (
        id uuid PRIMARY KEY, "tenantId" uuid, "merchantId" uuid, "botId" uuid,
        "bindingState" varchar(16), "notificationsEnabled" boolean,
        "chatId" varchar(32), capabilities varchar[]
      );
    `)
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

  it('adds per-group delivery state idempotently and defaults existing orders to undelivered', async () => {
    await queryRunner.query(
      `INSERT INTO merchant_order (id) VALUES ('00000000-0000-4000-8000-000000000001')`,
    )
    await migrateC2cTelegramReviewNotifications(queryRunner.manager)
    await migrateC2cTelegramReviewNotifications(queryRunner.manager)

    const [order] = (await queryRunner.query(`
      SELECT "telegramReviewNotificationGroupIds" AS "groupIds"
      FROM merchant_order
    `)) as Array<{ groupIds: string[] }>
    expect(order.groupIds).toEqual([])
  })

  it('selects pending mismatch until an eligible group receives it or a payment exists', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const merchantId = '00000000-0000-4000-8000-000000000020'
    const groupId = '00000000-0000-4000-8000-000000000030'
    await queryRunner.query(
      `UPDATE merchant_order SET
        "tenantId" = $1, "merchantId" = $2, "platformOrderId" = 'OKX-1',
        "platformCreatedAt" = now(), status = 'PENDING_PAYMENT', "identityMatched" = false,
        payable = true, "kycStatus" = 'PASS', "paymentMethod" = 'ALIPAY',
        "identityName" = '秦逢', "payeeName" = '秦世纪', "payeeIdentity" = 'buyer@example.com'`,
      [tenantId, merchantId],
    )
    await queryRunner.query(
      `INSERT INTO telegram_bot (id, "tenantId", status, capabilities)
       VALUES ('00000000-0000-4000-8000-000000000040', $1, 'active', ARRAY['C2C_ORDER_PAYMENT'])`,
      [tenantId],
    )
    await queryRunner.query(
      `INSERT INTO telegram_group (
        id, "tenantId", "merchantId", "botId", "bindingState",
        "notificationsEnabled", "chatId", capabilities
      ) VALUES ($1, $2, $3, '00000000-0000-4000-8000-000000000040',
        'ACTIVE', true, '-1001', ARRAY['C2C_ORDER_PAYMENT'])`,
      [groupId, tenantId, merchantId],
    )
    const source: Pick<DataSource, 'transaction' | 'getRepository' | 'query'> = {
      transaction: (work) => work(queryRunner.manager),
      getRepository: dataSource.getRepository.bind(dataSource),
      query: queryRunner.query.bind(queryRunner),
    }
    const store = new TypeOrmC2cOrderSyncStore(source)
    await expect(store.findPendingReviewOrderIds(tenantId, merchantId)).resolves.toEqual([
      '00000000-0000-4000-8000-000000000001',
    ])

    await queryRunner.query(
      `UPDATE merchant_order SET "telegramReviewNotificationGroupIds" = ARRAY[$1::uuid]`,
      [groupId],
    )
    await expect(store.findPendingReviewOrderIds(tenantId, merchantId)).resolves.toEqual([])

    await queryRunner.query(
      `INSERT INTO telegram_group (
        id, "tenantId", "merchantId", "botId", "bindingState",
        "notificationsEnabled", "chatId", capabilities
      ) VALUES ('00000000-0000-4000-8000-000000000031', $1, $2,
        '00000000-0000-4000-8000-000000000040', 'ACTIVE', true, '-1002',
        ARRAY['C2C_ORDER_PAYMENT'])`,
      [tenantId, merchantId],
    )
    await expect(store.findPendingReviewOrderIds(tenantId, merchantId)).resolves.toHaveLength(1)

    await queryRunner.query(
      `INSERT INTO payment_order ("tenantId", "merchantId", "sourceType", "sourceBusinessNo")
       VALUES ($1, $2, 'C2C_BUY', 'OKX-1')`,
      [tenantId, merchantId],
    )
    await expect(store.findPendingReviewOrderIds(tenantId, merchantId)).resolves.toEqual([])
  })
})
