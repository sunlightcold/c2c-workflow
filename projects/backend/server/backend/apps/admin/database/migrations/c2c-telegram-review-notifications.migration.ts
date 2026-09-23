import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cTelegramReviewNotifications(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789029000)')
  await manager.query(`
    ALTER TABLE merchant_order
      ADD COLUMN IF NOT EXISTS "telegramReviewNotificationGroupIds" uuid[]
      NOT NULL DEFAULT ARRAY[]::uuid[]
  `)
}

export class C2cTelegramReviewNotifications1789029000000 implements MigrationInterface {
  readonly name = 'C2cTelegramReviewNotifications1789029000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cTelegramReviewNotifications(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('C2C Telegram review notification migration is forward-only')
  }
}
