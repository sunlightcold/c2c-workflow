import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateTelegramUpdateInbox(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789009000)')
  await manager.query(`
    DO $$ BEGIN
      CREATE TYPE telegram_update_status_enum AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS telegram_update_event (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "botId" uuid NOT NULL REFERENCES telegram_bot(id) ON DELETE RESTRICT,
      "updateId" bigint NOT NULL,
      payload jsonb NOT NULL,
      status telegram_update_status_enum NOT NULL DEFAULT 'RECEIVED',
      "lastError" varchar(500)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_update_bot_update
      ON telegram_update_event ("botId", "updateId");
    CREATE INDEX IF NOT EXISTS idx_telegram_update_tenant_status
      ON telegram_update_event ("tenantId", status);
  `)
}

export class C2cTelegramUpdateInbox1789009000000 implements MigrationInterface {
  readonly name = 'C2cTelegramUpdateInbox1789009000000'
  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramUpdateInbox(queryRunner.manager)
    const [row] = (await queryRunner.query(
      `SELECT to_regclass(current_schema() || '.telegram_update_event') IS NOT NULL AS exists`,
    )) as Array<{ exists: boolean }>
    if (!row?.exists) throw new Error('Telegram update inbox migration is incomplete')
  }
  async down(): Promise<void> {
    throw new Error('Telegram update inbox migration is forward-only')
  }
}
