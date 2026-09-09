import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const MIGRATION_LOCK_ID = 912_407_147
const COLUMNS = ['maxConcurrency', 'maxQueuedRequests'] as const
const CONSTRAINTS = [
  'ck_sys_ai_channel_max_concurrency',
  'ck_sys_ai_channel_max_queued_requests',
] as const

export interface AiGatewayChannelCapacityState {
  columns: string[]
  constraints: string[]
}

export async function readAiGatewayChannelCapacityState(
  manager: EntityManager,
): Promise<AiGatewayChannelCapacityState> {
  const [columns, constraints] = await Promise.all([
    manager.query<Array<{ column_name: string }>>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'sys_ai_channel'
         AND column_name = ANY($1)
       ORDER BY column_name`,
      [[...COLUMNS]],
    ),
    manager.query<Array<{ constraint_name: string }>>(
      `SELECT constraint_name FROM information_schema.table_constraints
       WHERE constraint_schema = current_schema()
         AND table_name = 'sys_ai_channel'
         AND constraint_name = ANY($1)
       ORDER BY constraint_name`,
      [[...CONSTRAINTS]],
    ),
  ])
  return {
    columns: columns.map(({ column_name }) => column_name),
    constraints: constraints.map(({ constraint_name }) => constraint_name),
  }
}

export function assertAiGatewayChannelCapacityMigrated(state: AiGatewayChannelCapacityState): void {
  if (
    state.columns.join(',') !== [...COLUMNS].sort().join(',') ||
    state.constraints.join(',') !== [...CONSTRAINTS].sort().join(',')
  ) {
    throw new Error(`AI Gateway channel capacity migration is incomplete: ${JSON.stringify(state)}`)
  }
}

export async function migrateAiGatewayChannelCapacity(manager: EntityManager): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)
  await manager.query(`
    ALTER TABLE sys_ai_channel
      ADD COLUMN IF NOT EXISTS "maxConcurrency" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "maxQueuedRequests" integer NOT NULL DEFAULT 20;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_sys_ai_channel_max_concurrency'
          AND connamespace = current_schema()::regnamespace
      ) THEN
        ALTER TABLE sys_ai_channel ADD CONSTRAINT ck_sys_ai_channel_max_concurrency
          CHECK ("maxConcurrency" BETWEEN 1 AND 100);
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ck_sys_ai_channel_max_queued_requests'
          AND connamespace = current_schema()::regnamespace
      ) THEN
        ALTER TABLE sys_ai_channel ADD CONSTRAINT ck_sys_ai_channel_max_queued_requests
          CHECK ("maxQueuedRequests" BETWEEN 1 AND 100000);
      END IF;
    END $$;
  `)
}

export class AiGatewayChannelCapacity1785005600000 implements MigrationInterface {
  readonly name = 'AiGatewayChannelCapacity1785005600000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateAiGatewayChannelCapacity(queryRunner.manager)
    assertAiGatewayChannelCapacityMigrated(
      await readAiGatewayChannelCapacityState(queryRunner.manager),
    )
  }

  async down(): Promise<void> {
    throw new Error('AI Gateway channel capacity migration is forward-only')
  }
}
