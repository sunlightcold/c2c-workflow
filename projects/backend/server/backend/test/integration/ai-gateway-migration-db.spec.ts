/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  assertAiGatewayMigrated,
  migrateAiGateway,
  readAiGatewaySchemaState,
} from '@/apps/admin/database/migrations/ai-gateway.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('AI Gateway migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `ai_gateway_migration_test_${process.pid}_${Date.now()}`
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

  it('creates channels, models and feature routes idempotently', async () => {
    await migrateAiGateway(queryRunner.manager)
    await migrateAiGateway(queryRunner.manager)
    const state = await readAiGatewaySchemaState(queryRunner.manager)
    expect(() => assertAiGatewayMigrated(state)).not.toThrow()
  })

  it('stores chat completions and responses as distinct valid protocols', async () => {
    await migrateAiGateway(queryRunner.manager)
    await expect(
      queryRunner.query(
        `INSERT INTO sys_ai_channel (
           code, name, supplier, "adapterCode", "baseUrl", "encryptedApiKey"
         ) VALUES
           ('chat', 'Chat', 'openai', 'openai-chat-completions', 'https://example.com/v1', 'encrypted'),
           ('responses', 'Responses', 'openai', 'openai-responses', 'https://example.com/v1', 'encrypted')`,
      ),
    ).resolves.toBeDefined()
    await expect(
      queryRunner.query(
        `INSERT INTO sys_ai_channel (
           code, name, supplier, "adapterCode", "baseUrl", "encryptedApiKey"
         ) VALUES ('ambiguous', 'Ambiguous', 'openai', 'openai', 'https://example.com/v1', 'encrypted')`,
      ),
    ).rejects.toMatchObject({ code: '23514' })
  })
})
