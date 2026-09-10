/// <reference types="jest" />

import developmentConfig from '@/config/development'
import {
  assertObjectStorageCenterMigrated,
  migrateObjectStorageCenter,
  readObjectStorageCenterSchemaState,
} from '@/apps/admin/database/migrations/object-storage-center.migration'
import { ObjectStoragePurposePrefix1785002000000 } from '@/apps/admin/database/migrations/object-storage-purpose-prefix.migration'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Object storage center migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `storage_center_migration_test_${process.pid}_${Date.now()}`
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

  it('creates the storage channel and binding schema idempotently', async () => {
    await migrateObjectStorageCenter(queryRunner.manager)
    await migrateObjectStorageCenter(queryRunner.manager)
    const prefixMigration = new ObjectStoragePurposePrefix1785002000000()
    await prefixMigration.up(queryRunner)
    await prefixMigration.up(queryRunner)
    const prefixColumns = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'sys_storage_binding'
         AND column_name = 'keyPrefixOverride'`,
    )
    expect(prefixColumns).toHaveLength(1)
    const state = await readObjectStorageCenterSchemaState(queryRunner.manager)
    expect(() => assertObjectStorageCenterMigrated(state)).not.toThrow()

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
    await expect(
      queryRunner.query(`DELETE FROM sys_storage_channel WHERE id = $1`, [channelId]),
    ).rejects.toMatchObject({ code: '23503' })
  })
})
