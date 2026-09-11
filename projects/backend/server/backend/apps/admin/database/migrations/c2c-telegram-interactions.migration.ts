import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateTelegramInteractions(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789010000)')
  await manager.query(`
    CREATE TABLE IF NOT EXISTS telegram_interaction_context (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "botId" uuid NOT NULL REFERENCES telegram_bot(id) ON DELETE RESTRICT,
      "groupId" uuid NOT NULL REFERENCES telegram_group(id) ON DELETE RESTRICT,
      "chatId" varchar(32) NOT NULL,
      "telegramUserId" varchar(32) NOT NULL,
      "sourceMessageId" integer NOT NULL,
      action varchar(64) NOT NULL CHECK (action IN ('CREATE_MANUAL_PAYMENTS')),
      payload jsonb NOT NULL,
      state varchar(16) NOT NULL DEFAULT 'PENDING'
        CHECK (state IN ('PENDING', 'SUBMITTING', 'COMPLETED', 'FAILED', 'CANCELLED')),
      "expiresAt" timestamptz NOT NULL,
      "lastError" varchar(500)
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_interaction_scope
      ON telegram_interaction_context ("tenantId", "botId", "chatId", state);
    CREATE INDEX IF NOT EXISTS idx_telegram_interaction_expiry
      ON telegram_interaction_context (state, "expiresAt");
  `)
}

export class C2cTelegramInteractions1789010000000 implements MigrationInterface {
  readonly name = 'C2cTelegramInteractions1789010000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramInteractions(queryRunner.manager)
    const [row] = (await queryRunner.query(
      `SELECT to_regclass(current_schema() || '.telegram_interaction_context') IS NOT NULL AS exists`,
    )) as Array<{ exists: boolean }>
    if (!row?.exists) throw new Error('Telegram interaction migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('Telegram interaction migration is forward-only')
  }
}
