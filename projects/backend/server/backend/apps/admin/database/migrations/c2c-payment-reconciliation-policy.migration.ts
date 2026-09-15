import type { MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentReconciliationPolicy(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE payment_batch
    ADD COLUMN IF NOT EXISTS "reconciliationAttempts" integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "nextReconcileAt" timestamptz
  `)
  await queryRunner.query(`
    UPDATE payment_batch
    SET "nextReconcileAt" = NOW()
    WHERE status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN')
      AND "nextReconcileAt" IS NULL
  `)
  await queryRunner.query(`
    CREATE INDEX IF NOT EXISTS idx_payment_batch_reconciliation_due
    ON payment_batch ("nextReconcileAt", "updatedAt")
    WHERE status IN ('SUBMITTING', 'PROCESSING', 'UNKNOWN')
      AND "nextReconcileAt" IS NOT NULL
  `)
}

export class C2cPaymentReconciliationPolicy1789020000000 implements MigrationInterface {
  name = 'C2cPaymentReconciliationPolicy1789020000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentReconciliationPolicy(queryRunner)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_payment_batch_reconciliation_due`)
    await queryRunner.query(`
      ALTER TABLE payment_batch
      DROP COLUMN IF EXISTS "nextReconcileAt",
      DROP COLUMN IF EXISTS "reconciliationAttempts"
    `)
  }
}
