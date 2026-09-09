import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const TABLE = 'sys_ai_call_log'
const INDEXES = [
  'idx_sys_ai_call_log_started_at',
  'idx_sys_ai_call_log_feature_capability',
  'idx_sys_ai_call_log_status',
] as const
const CONSTRAINTS = ['ck_sys_ai_call_log_capability', 'ck_sys_ai_call_log_status'] as const

export interface AiCallLogsSchemaState {
  table: boolean
  indexes: string[]
  constraints: string[]
}

export async function migrateAiCallLogs(manager: EntityManager): Promise<void> {
  await manager.query(`
    CREATE TABLE IF NOT EXISTS "${TABLE}" (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "featureCode" varchar(120) NOT NULL,
      capability varchar(40) NOT NULL,
      "adapterCode" varchar(64) NOT NULL,
      "channelCode" varchar(64) NOT NULL,
      "modelCode" varchar(120) NOT NULL,
      status varchar(16) NOT NULL,
      attempt integer NOT NULL CHECK (attempt > 0),
      "durationMs" integer NOT NULL CHECK ("durationMs" >= 0),
      "startedAt" timestamptz NOT NULL,
      "endedAt" timestamptz NOT NULL,
      "inputTokens" integer,
      "outputTokens" integer,
      "totalTokens" integer,
      "errorType" varchar(200),
      "errorMessage" text,
      "requestId" varchar(100),
      "userId" varchar(64),
      CONSTRAINT ck_sys_ai_call_log_capability CHECK (
        capability IN ('image_generation', 'text_completion', 'vision_understanding')
      ),
      CONSTRAINT ck_sys_ai_call_log_status CHECK (status IN ('success', 'failed'))
    );
    CREATE INDEX IF NOT EXISTS idx_sys_ai_call_log_started_at
      ON "${TABLE}" ("startedAt" DESC);
    CREATE INDEX IF NOT EXISTS idx_sys_ai_call_log_feature_capability
      ON "${TABLE}" ("featureCode", capability);
    CREATE INDEX IF NOT EXISTS idx_sys_ai_call_log_status
      ON "${TABLE}" (status);
  `)
}

export async function readAiCallLogsState(manager: EntityManager): Promise<AiCallLogsSchemaState> {
  const [tables, indexes, constraints] = await Promise.all([
    manager.query<Array<{ exists: boolean }>>(
      `SELECT to_regclass(current_schema() || '.${TABLE}') IS NOT NULL AS exists`,
    ),
    manager.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND tablename = $1 AND indexname = ANY($2)
       ORDER BY indexname`,
      [TABLE, [...INDEXES]],
    ),
    manager.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE constraint_schema = current_schema() AND table_name = $1 AND constraint_name = ANY($2)
       ORDER BY constraint_name`,
      [TABLE, [...CONSTRAINTS]],
    ),
  ])
  return {
    table: tables[0]?.exists === true,
    indexes: indexes.map(({ indexname }) => indexname),
    constraints: constraints.map(({ constraint_name }) => constraint_name),
  }
}

export function assertAiCallLogsMigrated(state: AiCallLogsSchemaState): void {
  if (
    !state.table ||
    state.indexes.join(',') !== [...INDEXES].sort().join(',') ||
    state.constraints.join(',') !== [...CONSTRAINTS].sort().join(',')
  ) {
    throw new Error(`AI call logs migration is incomplete: ${JSON.stringify(state)}`)
  }
}

export class AiCallLogs1787001000000 implements MigrationInterface {
  readonly name = 'AiCallLogs1787001000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateAiCallLogs(queryRunner.manager)
    assertAiCallLogsMigrated(await readAiCallLogsState(queryRunner.manager))
  }

  async down(): Promise<void> {
    throw new Error('AI call logs migration is forward-only')
  }
}
