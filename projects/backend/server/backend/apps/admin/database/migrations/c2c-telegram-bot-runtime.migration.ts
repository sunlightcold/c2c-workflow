import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateTelegramBotRuntime(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789016000)')
  await manager.query(`
    ALTER TABLE telegram_bot
      ADD COLUMN IF NOT EXISTS "runtimeEnabled" boolean NOT NULL DEFAULT true;
  `)
}

export async function readTelegramBotRuntimeState(manager: EntityManager): Promise<boolean> {
  const rows = await manager.query<Array<{ exists: boolean }>>(`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'telegram_bot'
        AND column_name = 'runtimeEnabled'
    ) AS exists
  `)
  return rows[0]?.exists === true
}

export class C2cTelegramBotRuntime1789016000000 implements MigrationInterface {
  readonly name = 'C2cTelegramBotRuntime1789016000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramBotRuntime(queryRunner.manager)
    if (!(await readTelegramBotRuntimeState(queryRunner.manager))) {
      throw new Error('Telegram bot runtime migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('Telegram bot runtime migration is forward-only')
  }
}
