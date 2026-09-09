/// <reference types="jest" />

import {
  assertClientErrorEventsMigrated,
  migrateClientErrorEvents,
  readClientErrorEventsState,
} from '@/apps/admin/database/migrations/client-error-events.migration'
import developmentConfig from '@/config/development'
import { DataSource, type QueryRunner } from 'typeorm'

describe('Client error events migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `client_error_events_test_${process.pid}_${Date.now()}`
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
      extra: { options: `-c search_path=${schema},public` },
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

  it('creates the client error event store and is repeatable', async () => {
    await migrateClientErrorEvents(queryRunner.manager)
    await migrateClientErrorEvents(queryRunner.manager)

    const state = await readClientErrorEventsState(queryRunner.manager)
    expect(() => assertClientErrorEventsMigrated(state)).not.toThrow()
    expect(state).toEqual({
      constraints: [
        'ck_sys_client_error_event_level',
        'ck_sys_client_error_event_platform',
        'ck_sys_client_error_event_source',
      ],
      indexes: [
        'idx_sys_client_error_event_app_occurred',
        'idx_sys_client_error_event_created_at',
        'idx_sys_client_error_event_occurred_at',
        'idx_sys_client_error_event_release',
      ],
      table: true,
    })

    await queryRunner.query(
      `INSERT INTO sys_client_error_event (
         "eventId", "appCode", environment, release, platform, level, source,
         message, ip, breadcrumbs, "occurredAt"
       ) VALUES ($1, 'magic-perler', 'production', 'release-1', 'web', 'error', 'global',
         'boom', '127.0.0.1', '[]'::jsonb, now())`,
      ['00000000-0000-4000-8000-000000000301'],
    )

    await expect(
      queryRunner.query(
        `INSERT INTO sys_client_error_event (
           "eventId", "appCode", environment, release, platform, level, source,
           message, ip, breadcrumbs, "occurredAt"
         ) VALUES ($1, 'magic-perler', 'production', 'release-1', 'web', 'error', 'global',
           'duplicate', '127.0.0.1', '[]'::jsonb, now())`,
        ['00000000-0000-4000-8000-000000000301'],
      ),
    ).rejects.toThrow()
  })
})
