import type { MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentPlatformStateSeparation(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE payment_order
      ADD COLUMN IF NOT EXISTS "platformConfirmLastError" varchar(512)
  `)
  await queryRunner.query(`
    UPDATE payment_order
    SET "platformConfirmLastError" = CASE
          WHEN status = 'PLATFORM_CONFIRM_PENDING'
            THEN COALESCE("platformConfirmLastError", "lastError")
          ELSE "platformConfirmLastError"
        END,
        "lastError" = NULL,
        status = 'SUCCESS'
    WHERE status IN ('PLATFORM_CONFIRM_PENDING', 'COMPLETED')
  `)
  await queryRunner.query(`DROP INDEX IF EXISTS idx_payment_order_platform_confirm_recovery`)
  await queryRunner.query(`
    CREATE INDEX idx_payment_order_platform_confirm_recovery
    ON payment_order ("platformConfirmStatus", "platformConfirmLastAttemptAt")
    WHERE status = 'SUCCESS'
      AND "platformConfirmStatus" IN ('PENDING', 'PROCESSING')
  `)
}

export class C2cPaymentPlatformStateSeparation1789026000000 implements MigrationInterface {
  readonly name = 'C2cPaymentPlatformStateSeparation1789026000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentPlatformStateSeparation(queryRunner)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payment_order_platform_confirm_recovery`)
    await queryRunner.query(`
      CREATE INDEX idx_payment_order_platform_confirm_recovery
      ON payment_order ("platformConfirmStatus", "platformConfirmLastAttemptAt")
      WHERE status = 'PLATFORM_CONFIRM_PENDING'
    `)
    await queryRunner.query(`
      ALTER TABLE payment_order
        DROP COLUMN IF EXISTS "platformConfirmLastError"
    `)
  }
}
