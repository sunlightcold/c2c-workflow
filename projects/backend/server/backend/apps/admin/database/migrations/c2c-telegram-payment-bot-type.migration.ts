import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateTelegramPaymentBotType(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789015000)')
  await manager.query(`
    UPDATE telegram_bot
    SET "botType" = 'PAYMENT'
    WHERE "botType"::text IN ('HQ', 'MERCHANT')
  `)
  await manager.query(`
    ALTER TABLE telegram_bot
      ALTER COLUMN "botType" TYPE text USING "botType"::text
  `)
  await manager.query('DROP TYPE telegram_bot_type_enum')
  await manager.query(`CREATE TYPE telegram_bot_type_enum AS ENUM ('PAYMENT')`)
  await manager.query(`
    ALTER TABLE telegram_bot
      ALTER COLUMN "botType" TYPE telegram_bot_type_enum
      USING "botType"::telegram_bot_type_enum
  `)
}

export class C2cTelegramPaymentBotType1789015000000 implements MigrationInterface {
  readonly name = 'C2cTelegramPaymentBotType1789015000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramPaymentBotType(queryRunner.manager)
    const [row] = (await queryRunner.query(
      `SELECT enum_range(NULL::telegram_bot_type_enum)::text AS values`,
    )) as Array<{ values: string }>
    if (row?.values !== '{PAYMENT}') {
      throw new Error('Telegram payment bot type migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('Telegram payment bot type migration is forward-only')
  }
}
