/// <reference types="jest" />

import { migrateC2cBusinessFoundation } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { migrateC2cPaymentOrders } from '@/apps/admin/database/migrations/c2c-payment-orders.migration'
import { migrateC2cPlatformConfirmationControl } from '@/apps/admin/database/migrations/c2c-platform-confirmation-control.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('C2C platform confirmation control migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `c2c_platform_confirmation_test_${process.pid}_${Date.now()}`
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

  it('adds confirmation state and persisted merchant throttle fields idempotently', async () => {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    await migrateC2cPaymentOrders(queryRunner.manager)
    await migrateC2cPlatformConfirmationControl(queryRunner.manager)
    await migrateC2cPlatformConfirmationControl(queryRunner.manager)

    const rows = (await queryRunner.query(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND (
           (table_name = 'payment_order' AND column_name LIKE 'platformConfirm%')
           OR (table_name = 'merchant' AND column_name LIKE 'paidConfirm%')
         )
       ORDER BY table_name, column_name`,
    )) as Array<{ column_name: string; table_name: string }>

    expect(rows).toEqual(
      expect.arrayContaining([
        { table_name: 'merchant', column_name: 'paidConfirmLockId' },
        { table_name: 'merchant', column_name: 'paidConfirmLockUntil' },
        { table_name: 'merchant', column_name: 'paidConfirmNextAt' },
        { table_name: 'payment_order', column_name: 'platformConfirmAttempts' },
        { table_name: 'payment_order', column_name: 'platformConfirmLastAttemptAt' },
        { table_name: 'payment_order', column_name: 'platformConfirmStatus' },
        { table_name: 'payment_order', column_name: 'platformConfirmedAt' },
      ]),
    )
    const [index] = (await queryRunner.query(
      `SELECT to_regclass('idx_payment_order_platform_confirm_recovery') IS NOT NULL AS present`,
    )) as Array<{ present: boolean }>
    expect(index.present).toBe(true)
  })
})
