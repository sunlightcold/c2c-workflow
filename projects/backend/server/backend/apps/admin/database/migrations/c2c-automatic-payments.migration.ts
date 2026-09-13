import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cAutomaticPayments(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789013000)')
  await manager.query(`
    ALTER TABLE merchant
      ADD COLUMN IF NOT EXISTS "automaticPaymentEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "automaticPaymentExecutionMode"
        payment_execution_mode_enum NOT NULL DEFAULT 'INSTANT';

    CREATE INDEX IF NOT EXISTS idx_merchant_automatic_payment
      ON merchant ("tenantId", "automaticPaymentEnabled", status)
      WHERE "automaticPaymentEnabled" = true;
  `)
}

export class C2cAutomaticPayments1789013000000 implements MigrationInterface {
  readonly name = 'C2cAutomaticPayments1789013000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cAutomaticPayments(queryRunner.manager)
    const rows = (await queryRunner.query(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'merchant'
          AND column_name = ANY($1)
      `,
      [['automaticPaymentEnabled', 'automaticPaymentExecutionMode']],
    )) as Array<{ column_name: string }>
    if (rows.length !== 2) throw new Error('C2C automatic payment migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C automatic payment migration is forward-only')
  }
}
