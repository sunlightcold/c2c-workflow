/// <reference types="jest" />

import { adminMigrations } from '@/apps/admin/database/migrations'
import developmentConfig from '@/config/development'
import { DataSource } from 'typeorm'

describe('Deployment migrations database integration', () => {
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

    expect(applied.map(({ name }) => name)).toEqual([
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
    ])
    expect(repeated).toEqual([])
    await expect(
      dataSource.query(`SELECT name FROM schema_migrations ORDER BY timestamp`),
    ).resolves.toEqual([
      { name: 'TutorialCenter1785000000000' },
      { name: 'ObjectStorageCenter1785001000000' },
      { name: 'ObjectStoragePurposePrefix1785002000000' },
      { name: 'TutorialContentStoragePurpose1785005000000' },
      { name: 'AiGateway1785005500000' },
      { name: 'AiGatewayChannelCapacity1785005600000' },
      { name: 'ClientErrorEvents1785008000000' },
      { name: 'AiCallLogs1787001000000' },
      { name: 'C2cBusinessFoundation1789000000000' },
      { name: 'C2cPaymentOrders1789001000000' },
      { name: 'C2cPaymentRouting1789002000000' },
    ])
  })
})
