import type { MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPlatformConfirmationControl(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE payment_order
      ADD COLUMN IF NOT EXISTS "platformConfirmStatus" varchar(16) NOT NULL DEFAULT 'NOT_REQUIRED',
      ADD COLUMN IF NOT EXISTS "platformConfirmAttempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "platformConfirmLastAttemptAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "platformConfirmedAt" timestamptz
  `)
  await queryRunner.query(`
    UPDATE payment_order
    SET "platformConfirmStatus" = CASE
      WHEN status = 'COMPLETED' THEN 'SUCCESS'
      WHEN status = 'PLATFORM_CONFIRM_PENDING' THEN 'FAILED'
      WHEN status = 'SUCCESS' AND "sourceType" = 'C2C_BUY' THEN 'PENDING'
      ELSE 'NOT_REQUIRED'
    END,
    "platformConfirmedAt" = CASE WHEN status = 'COMPLETED' THEN "updatedAt" ELSE NULL END
  `)
  await queryRunner.query(`
    ALTER TABLE payment_order
      DROP CONSTRAINT IF EXISTS ck_payment_order_platform_confirm_status
  `)
  await queryRunner.query(`
    ALTER TABLE payment_order
      ADD CONSTRAINT ck_payment_order_platform_confirm_status
      CHECK ("platformConfirmStatus" IN ('NOT_REQUIRED', 'PENDING', 'PROCESSING', 'FAILED', 'SUCCESS'))
  `)
  await queryRunner.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_order_platform_confirm_recovery
    ON payment_order ("platformConfirmStatus", "platformConfirmLastAttemptAt")
    WHERE status = 'PLATFORM_CONFIRM_PENDING'
  `)
  await queryRunner.query(`
    ALTER TABLE merchant
      ADD COLUMN IF NOT EXISTS "paidConfirmLockId" uuid,
      ADD COLUMN IF NOT EXISTS "paidConfirmLockUntil" timestamptz,
      ADD COLUMN IF NOT EXISTS "paidConfirmNextAt" timestamptz
  `)
}

export class C2cPlatformConfirmationControl1789023000000 implements MigrationInterface {
  readonly name = 'C2cPlatformConfirmationControl1789023000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPlatformConfirmationControl(queryRunner)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payment_order_platform_confirm_recovery`)
    await queryRunner.query(`
      ALTER TABLE payment_order
        DROP CONSTRAINT IF EXISTS ck_payment_order_platform_confirm_status,
        DROP COLUMN IF EXISTS "platformConfirmedAt",
        DROP COLUMN IF EXISTS "platformConfirmLastAttemptAt",
        DROP COLUMN IF EXISTS "platformConfirmAttempts",
        DROP COLUMN IF EXISTS "platformConfirmStatus"
    `)
    await queryRunner.query(`
      ALTER TABLE merchant
        DROP COLUMN IF EXISTS "paidConfirmNextAt",
        DROP COLUMN IF EXISTS "paidConfirmLockUntil",
        DROP COLUMN IF EXISTS "paidConfirmLockId"
    `)
  }
}
