import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateTelegramBatchInteractions(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789011000)')
  await manager.query(`
    ALTER TABLE telegram_interaction_context
      DROP CONSTRAINT IF EXISTS telegram_interaction_context_action_check;
    ALTER TABLE telegram_interaction_context
      ADD CONSTRAINT telegram_interaction_context_action_check
      CHECK (action IN ('CREATE_MANUAL_PAYMENTS', 'SUBMIT_PAYMENT_BATCHES'));
  `)
}

export class C2cTelegramBatchInteractions1789011000000 implements MigrationInterface {
  readonly name = 'C2cTelegramBatchInteractions1789011000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramBatchInteractions(queryRunner.manager)
    const [row] = (await queryRunner.query(
      `SELECT pg_get_constraintdef(oid) AS definition
       FROM pg_constraint
       WHERE conrelid = 'telegram_interaction_context'::regclass
         AND conname = 'telegram_interaction_context_action_check'`,
    )) as Array<{ definition: string }>
    if (!row?.definition.includes('SUBMIT_PAYMENT_BATCHES')) {
      throw new Error('Telegram batch interaction migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('Telegram batch interaction migration is forward-only')
  }
}
