import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const TABLE = 'sys_client_error_event'
const CONSTRAINTS = [
  'ck_sys_client_error_event_level',
  'ck_sys_client_error_event_platform',
  'ck_sys_client_error_event_source',
] as const
const INDEXES = [
  'idx_sys_client_error_event_app_occurred',
  'idx_sys_client_error_event_created_at',
  'idx_sys_client_error_event_occurred_at',
  'idx_sys_client_error_event_release',
] as const

export interface ClientErrorEventsState {
  constraints: string[]
  indexes: string[]
  table: boolean
}

export async function migrateClientErrorEvents(manager: EntityManager): Promise<void> {
  await manager.query(`
    CREATE TABLE IF NOT EXISTS "${TABLE}" (
      "eventId" uuid PRIMARY KEY,
      "appCode" varchar(32) NOT NULL,
      environment varchar(32) NOT NULL,
      release varchar(100) NOT NULL,
      platform varchar(16) NOT NULL,
      level varchar(16) NOT NULL,
      source varchar(16) NOT NULL,
      "errorType" varchar(200),
      message text NOT NULL,
      stack text,
      "componentStack" text,
      route varchar(1000),
      feature varchar(100),
      locale varchar(20),
      "sessionId" uuid,
      "userRef" varchar(100),
      ip varchar(50) NOT NULL,
      "userAgent" varchar(500),
      breadcrumbs jsonb NOT NULL DEFAULT '[]'::jsonb,
      "occurredAt" timestamptz NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT ck_sys_client_error_event_level
        CHECK (level IN ('error', 'fatal', 'warning')),
      CONSTRAINT ck_sys_client_error_event_platform
        CHECK (platform IN ('android', 'desktop', 'ios', 'pwa', 'web')),
      CONSTRAINT ck_sys_client_error_event_source
        CHECK (source IN ('caught', 'global', 'network', 'promise', 'react', 'resource', 'worker'))
    );

    CREATE INDEX IF NOT EXISTS idx_sys_client_error_event_occurred_at
      ON "${TABLE}" ("occurredAt" DESC);
    CREATE INDEX IF NOT EXISTS idx_sys_client_error_event_app_occurred
      ON "${TABLE}" ("appCode", "occurredAt" DESC);
    CREATE INDEX IF NOT EXISTS idx_sys_client_error_event_created_at
      ON "${TABLE}" ("createdAt");
    CREATE INDEX IF NOT EXISTS idx_sys_client_error_event_release
      ON "${TABLE}" (release);
  `)
}

export async function readClientErrorEventsState(
  manager: EntityManager,
): Promise<ClientErrorEventsState> {
  const [tables, constraints, indexes] = await Promise.all([
    manager.query<Array<{ exists: boolean }>>(
      `SELECT to_regclass(current_schema() || '.${TABLE}') IS NOT NULL AS exists`,
    ),
    manager.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE constraint_schema = current_schema()
         AND table_name = $1
         AND constraint_name = ANY($2)
       ORDER BY constraint_name`,
      [TABLE, [...CONSTRAINTS]],
    ),
    manager.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema()
         AND tablename = $1
         AND indexname = ANY($2)
       ORDER BY indexname`,
      [TABLE, [...INDEXES]],
    ),
  ])
  return {
    constraints: constraints.map(({ constraint_name }) => constraint_name),
    indexes: indexes.map(({ indexname }) => indexname),
    table: tables[0]?.exists === true,
  }
}

export function assertClientErrorEventsMigrated(state: ClientErrorEventsState): void {
  if (
    !state.table ||
    state.constraints.join(',') !== [...CONSTRAINTS].sort().join(',') ||
    state.indexes.join(',') !== [...INDEXES].sort().join(',')
  ) {
    throw new Error(`Client error events migration is incomplete: ${JSON.stringify(state)}`)
  }
}

export class ClientErrorEvents1785008000000 implements MigrationInterface {
  readonly name = 'ClientErrorEvents1785008000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateClientErrorEvents(queryRunner.manager)
    assertClientErrorEventsMigrated(await readClientErrorEventsState(queryRunner.manager))
  }

  async down(): Promise<void> {
    throw new Error('Client error events migration is forward-only')
  }
}
