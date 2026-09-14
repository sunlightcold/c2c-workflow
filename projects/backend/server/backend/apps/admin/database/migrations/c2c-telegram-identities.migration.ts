import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Telegram identities are independent principals; they do not require a sys_user account. */
export class C2cTelegramIdentities1789018000000 implements MigrationInterface {
  readonly name = 'C2cTelegramIdentities1789018000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('SELECT pg_advisory_xact_lock(1789008000)')
    await queryRunner.query(`
      DROP INDEX IF EXISTS uq_telegram_group_member_user;
      DROP INDEX IF EXISTS uq_telegram_super_admin_tenant_user;
      ALTER TABLE telegram_group_member
        DROP CONSTRAINT IF EXISTS telegram_group_member_userId_fkey,
        DROP COLUMN IF EXISTS "userId";
      ALTER TABLE telegram_super_admin
        DROP CONSTRAINT IF EXISTS telegram_super_admin_userId_fkey,
        DROP COLUMN IF EXISTS "userId";
    `)
  }

  async down(): Promise<void> {
    throw new Error('Telegram identity migration is forward-only')
  }
}
