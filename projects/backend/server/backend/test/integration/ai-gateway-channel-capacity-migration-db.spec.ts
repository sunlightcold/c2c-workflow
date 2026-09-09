/// <reference types="jest" />

import { migrateAiGateway } from '@/apps/admin/database/migrations/ai-gateway.migration'
import {
  assertAiGatewayChannelCapacityMigrated,
  migrateAiGatewayChannelCapacity,
  readAiGatewayChannelCapacityState,
} from '@/apps/admin/database/migrations/ai-gateway-channel-capacity.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('AI Gateway channel capacity migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `ai_gateway_capacity_test_${process.pid}_${Date.now()}`
  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

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
    })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`)
    await migrateAiGateway(queryRunner.manager)
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

  it('adds constrained channel capacity fields idempotently', async () => {
    await migrateAiGatewayChannelCapacity(queryRunner.manager)
    await migrateAiGatewayChannelCapacity(queryRunner.manager)
    const state = await readAiGatewayChannelCapacityState(queryRunner.manager)

    expect(() => assertAiGatewayChannelCapacityMigrated(state)).not.toThrow()
    await expect(
      queryRunner.query(
        `INSERT INTO sys_ai_channel (
          code, name, supplier, "adapterCode", "baseUrl", "encryptedApiKey", "maxConcurrency"
        ) VALUES ('invalid-capacity', 'Invalid', 'test', 'openai-images', 'https://example.com/v1', 'encrypted', 0)`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
