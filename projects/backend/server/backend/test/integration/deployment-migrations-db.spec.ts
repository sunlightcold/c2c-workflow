/// <reference types="jest" />

import { adminMigrations } from '@/apps/admin/database/migrations'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Deployment migrations database integration', () => {
  const expectedMigrationNames = [
    'SystemFoundation1784000000000',
    'TutorialCenter1785000000000',
    'ObjectStorageCenter1785001000000',
    'ObjectStoragePurposePrefix1785002000000',
    'TutorialContentStoragePurpose1785005000000',
    'AiGateway1785005500000',
    'AiGatewayChannelCapacity1785005600000',
    'ClientErrorEvents1785008000000',
    'AiCallLogs1787001000000',
    'C2cBusinessFoundation1789000000000',
    'C2cPaymentOrders1789001000000',
    'C2cPaymentRouting1789002000000',
    'C2cMerchantPlatformCredentials1789003000000',
    'C2cMerchantOrders1789004000000',
    'C2cPaymentBatches1789005000000',
    'C2cMerchantAccountOperations1789006000000',
    'C2cMerchantOrderAppeals1789007000000',
    'C2cTelegramAdministration1789008000000',
    'C2cTelegramUpdateInbox1789009000000',
    'C2cTelegramInteractions1789010000000',
    'C2cTelegramBatchInteractions1789011000000',
    'PaymentAccountCredentials1789012000000',
    'C2cAutomaticPayments1789013000000',
    'RemoveAiAndClientError1789014000000',
    'C2cTelegramPaymentBotType1789015000000',
  ]
  const { postgres } = developmentConfig.admin
  const schema = `deployment_migrations_test_${process.pid}_${Date.now()}`

  let adminDataSource: DataSource
  let dataSource: DataSource

  beforeAll(async () => {
    adminDataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      synchronize: false,
      logging: false,
    })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)

    dataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      schema,
      synchronize: false,
      logging: false,
      migrations: adminMigrations,
      migrationsTableName: 'schema_migrations',
      migrationsTransactionMode: 'each',
      extra: {
        options: `-c search_path=${schema},public`,
      },
    })
    await dataSource.initialize()
  })

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('records all registered migrations and skips them on the next deployment', async () => {
    const applied = await dataSource.runMigrations()
    const repeated = await dataSource.runMigrations()

    expect(applied.map(({ name }) => name)).toEqual(expectedMigrationNames)
    expect(repeated).toEqual([])
    await expect(
      dataSource.query(`SELECT name FROM schema_migrations ORDER BY timestamp`),
    ).resolves.toEqual(expectedMigrationNames.map((name) => ({ name })))
    await expect(
      dataSource.query<{ table_name: string }[]>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = current_schema()
           AND table_name = ANY($1)
         ORDER BY table_name`,
        [
          [
            'sys_access_token',
            'sys_log',
            'sys_menu',
            'sys_online_user',
            'sys_params',
            'sys_role',
            'sys_role_menu',
            'sys_static_file',
            'sys_task',
            'sys_task_log',
            'sys_user',
            'sys_user_file',
            'sys_user_role',
          ],
        ],
      ),
    ).resolves.toHaveLength(13)
    await expect(
      dataSource.query<{ table_name: string }[]>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = current_schema()
           AND table_name = ANY($1)
         ORDER BY table_name`,
        [[
          'sys_ai_call_log',
          'sys_ai_channel',
          'sys_ai_feature_route',
          'sys_ai_model',
          'sys_client_error_event',
        ]],
      ),
    ).resolves.toEqual([])
    await expect(
      dataSource.query<{ constraint_name: string }[]>(
        `SELECT constraint_name
         FROM information_schema.table_constraints
         WHERE table_schema = current_schema()
           AND table_name = 'sys_user'
           AND constraint_name = 'fk_sys_user_tenant'
           AND constraint_type = 'FOREIGN KEY'`,
      ),
    ).resolves.toEqual([{ constraint_name: 'fk_sys_user_tenant' }])
  })
})
