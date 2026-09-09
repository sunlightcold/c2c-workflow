import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const MIGRATION_LOCK_ID = 912_407_146
const TABLES = ['sys_ai_channel', 'sys_ai_feature_route', 'sys_ai_model'] as const
const INDEXES = [
  'uq_sys_ai_channel_code',
  'uq_sys_ai_feature_route_priority',
  'uq_sys_ai_feature_route_target',
  'uq_sys_ai_model_code',
] as const
const CONSTRAINTS = [
  'ck_sys_ai_channel_adapter',
  'ck_sys_ai_channel_status',
  'ck_sys_ai_feature_route_capability',
  'ck_sys_ai_model_adapter',
  'ck_sys_ai_model_capabilities',
] as const

export interface AiGatewaySchemaState {
  constraints: string[]
  indexes: string[]
  tables: string[]
}

export async function readAiGatewaySchemaState(
  manager: EntityManager,
): Promise<AiGatewaySchemaState> {
  const [tables, indexes, constraints] = await Promise.all([
    manager.query<Array<{ table_name: string }>>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)
       ORDER BY table_name`,
      [[...TABLES]],
    ),
    manager.query<Array<{ indexname: string }>>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = ANY($1)
       ORDER BY indexname`,
      [[...INDEXES]],
    ),
    manager.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE constraint_schema = current_schema() AND constraint_name = ANY($1)
       ORDER BY constraint_name`,
      [[...CONSTRAINTS]],
    ),
  ])
  return {
    constraints: constraints.map(({ constraint_name }) => constraint_name),
    indexes: indexes.map(({ indexname }) => indexname),
    tables: tables.map(({ table_name }) => table_name),
  }
}

export function assertAiGatewayMigrated(state: AiGatewaySchemaState): void {
  if (
    state.tables.join(',') !== TABLES.join(',') ||
    state.indexes.join(',') !== INDEXES.join(',') ||
    state.constraints.join(',') !== CONSTRAINTS.join(',')
  ) {
    throw new Error(`AI Gateway migration is incomplete: ${JSON.stringify(state)}`)
  }
}

export async function migrateAiGateway(manager: EntityManager): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)
  await manager.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  await manager.query(`
    CREATE TABLE IF NOT EXISTS sys_ai_channel (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      supplier varchar(100) NOT NULL,
      "adapterCode" varchar(64) NOT NULL,
      "baseUrl" varchar(512) NOT NULL,
      "encryptedApiKey" text NOT NULL,
      "credentialVersion" integer NOT NULL DEFAULT 1,
      status varchar(16) NOT NULL DEFAULT 'disabled',
      "timeoutMs" integer NOT NULL DEFAULT 60000 CHECK ("timeoutMs" BETWEEN 1000 AND 900000),
      "lastCheckedAt" timestamptz,
      "lastCheckMessage" varchar(512),
      CONSTRAINT ck_sys_ai_channel_adapter CHECK (
        "adapterCode" IN (
          'gemini-generate-content',
          'openai-chat-completions',
          'openai-images',
          'openai-responses'
        )
      ),
      CONSTRAINT ck_sys_ai_channel_status CHECK (status IN ('active', 'disabled', 'error'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_ai_channel_code ON sys_ai_channel (code);

    CREATE TABLE IF NOT EXISTS sys_ai_model (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      code varchar(120) NOT NULL,
      name varchar(120) NOT NULL,
      "adapterCode" varchar(64) NOT NULL,
      "upstreamModel" varchar(160) NOT NULL,
      capabilities jsonb NOT NULL,
      enabled boolean NOT NULL DEFAULT false,
      CONSTRAINT ck_sys_ai_model_adapter CHECK (
        "adapterCode" IN (
          'gemini-generate-content',
          'openai-chat-completions',
          'openai-images',
          'openai-responses'
        )
      ),
      CONSTRAINT ck_sys_ai_model_capabilities CHECK (
        jsonb_typeof(capabilities) = 'array' AND jsonb_array_length(capabilities) > 0
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_ai_model_code ON sys_ai_model (code);

    CREATE TABLE IF NOT EXISTS sys_ai_feature_route (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "featureCode" varchar(120) NOT NULL,
      capability varchar(40) NOT NULL,
      "modelId" uuid NOT NULL REFERENCES sys_ai_model(id) ON DELETE RESTRICT,
      "channelId" uuid NOT NULL REFERENCES sys_ai_channel(id) ON DELETE RESTRICT,
      priority integer NOT NULL CHECK (priority > 0),
      enabled boolean NOT NULL DEFAULT true,
      CONSTRAINT ck_sys_ai_feature_route_capability CHECK (
        capability IN ('image_generation', 'text_completion', 'vision_understanding')
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_ai_feature_route_priority
      ON sys_ai_feature_route ("featureCode", priority);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_ai_feature_route_target
      ON sys_ai_feature_route ("featureCode", "modelId", "channelId");
  `)
}

export class AiGateway1785005500000 implements MigrationInterface {
  readonly name = 'AiGateway1785005500000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateAiGateway(queryRunner.manager)
    assertAiGatewayMigrated(await readAiGatewaySchemaState(queryRunner.manager))
  }

  async down(): Promise<void> {
    throw new Error('AI Gateway migration is forward-only')
  }
}
