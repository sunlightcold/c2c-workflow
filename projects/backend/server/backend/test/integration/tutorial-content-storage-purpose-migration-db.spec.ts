/// <reference types="jest" />

import { TutorialContentStoragePurpose1785005000000 } from '@/apps/admin/database/migrations/tutorial-content-storage-purpose.migration'
import { migrateObjectStorageCenter } from '@/apps/admin/database/migrations/object-storage-center.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Tutorial content storage purpose migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `tutorial_storage_purpose_test_${process.pid}_${Date.now()}`
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
    await migrateObjectStorageCenter(queryRunner.manager)
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

  it('copies the avatar channel binding and remains unchanged when deployed again', async () => {
    const channelId = '00000000-0000-4000-8000-000000000001'
    await queryRunner.query(
      `INSERT INTO sys_storage_channel (
        id, code, name, provider, endpoint, bucket, "accessKeyId", "encryptedSecretAccessKey"
      ) VALUES ($1, 'test', 'Test', 's3_compatible', 'http://localhost:9000', 'test-bucket', 'key', 'secret')`,
      [channelId],
    )
    await queryRunner.query(
      `INSERT INTO sys_storage_binding ("purposeCode", "channelId") VALUES ('system.avatar', $1)`,
      [channelId],
    )

    const migration = new TutorialContentStoragePurpose1785005000000()
    await migration.up(queryRunner)
    await migration.up(queryRunner)

    await expect(
      queryRunner.query(
        `SELECT "purposeCode", "channelId"
         FROM sys_storage_binding
         WHERE "purposeCode" = 'system.tutorial-content'`,
      ),
    ).resolves.toEqual([{ purposeCode: 'system.tutorial-content', channelId }])
  })
})
