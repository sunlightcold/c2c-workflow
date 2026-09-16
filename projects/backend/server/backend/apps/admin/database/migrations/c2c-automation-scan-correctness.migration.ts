import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cAutomationScanCorrectness(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789027000)')
  await manager.query(`
    ALTER TABLE merchant
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCompletedLastScanAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCompletedLastError" varchar(512),
      ADD COLUMN IF NOT EXISTS "autoAppealLastScanAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "autoAppealLastError" varchar(512);

    DROP INDEX IF EXISTS idx_merchant_order_auto_appeal_due;

    CREATE INDEX IF NOT EXISTS idx_merchant_order_auto_appeal_due
      ON merchant_order (
        "tenantId", "merchantId", "autoAppealNextAttemptAt", "platformOrderId"
      )
      WHERE status = 'PENDING_RELEASE'
        AND "appealStatus" IS NULL
        AND ("autoAppealStatus" IS NULL OR "autoAppealStatus" = 'RETRY');

    CREATE INDEX IF NOT EXISTS idx_payment_order_auto_appeal_confirmed
      ON payment_order (
        "tenantId", "merchantId", "sourceBusinessNo", "platformConfirmedAt"
      )
      WHERE status = 'SUCCESS'
        AND "sourceType" = 'C2C_BUY'
        AND "platformConfirmStatus" = 'SUCCESS'
        AND "platformConfirmedAt" IS NOT NULL;
  `)
}

export class C2cAutomationScanCorrectness1789027000000 implements MigrationInterface {
  readonly name = 'C2cAutomationScanCorrectness1789027000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cAutomationScanCorrectness(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('C2C automation scan correctness migration is forward-only')
  }
}
