import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cFullProviderParity(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789024000)')
  await manager.query(`
    ALTER TABLE merchant
      ADD COLUMN IF NOT EXISTS "autoAppealEnabledAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCompletedEnabledAt" timestamptz;

    UPDATE merchant
    SET "autoAppealEnabledAt" = COALESCE("updatedAt", "createdAt", now())
    WHERE "autoAppealEnabled" = true AND "autoAppealEnabledAt" IS NULL;

    UPDATE merchant
    SET "c2cChatOrderCompletedEnabledAt" = COALESCE("updatedAt", "createdAt", now())
    WHERE "c2cChatOrderCompletedEnabled" = true
      AND "c2cChatOrderCompletedEnabledAt" IS NULL;

    ALTER TABLE merchant_order
      ADD COLUMN IF NOT EXISTS "kycStatus" varchar(32),
      ADD COLUMN IF NOT EXISTS "autoAppealStatus" varchar(32),
      ADD COLUMN IF NOT EXISTS "autoAppealAttempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "autoAppealNextAttemptAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "autoAppealProcessedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "autoAppealLastError" varchar(512),
      ADD COLUMN IF NOT EXISTS "completionReplyStatus" varchar(32),
      ADD COLUMN IF NOT EXISTS "completionReplyClaimedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "completionReplySentAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "completionReplyNextRetryAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "completionReplyAttempts" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "completionReplyLastError" varchar(512);

    ALTER TABLE payment_batch
      ADD COLUMN IF NOT EXISTS "telegramSubmissionMessages" jsonb NOT NULL DEFAULT '[]'::jsonb;

    DO $$ BEGIN
      ALTER TABLE merchant_order ADD CONSTRAINT ck_merchant_order_auto_appeal_status
        CHECK (
          "autoAppealStatus" IS NULL OR
          "autoAppealStatus" IN ('RETRY', 'SUBMITTED', 'SKIPPED', 'MANUAL_REQUIRED')
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    DO $$ BEGIN
      ALTER TABLE merchant_order ADD CONSTRAINT ck_merchant_order_completion_reply_status
        CHECK (
          "completionReplyStatus" IS NULL OR
          "completionReplyStatus" IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE INDEX IF NOT EXISTS idx_merchant_order_auto_appeal_due
      ON merchant_order ("tenantId", "merchantId", "autoAppealNextAttemptAt", "platformUpdatedAt")
      WHERE status = 'PENDING_RELEASE' AND "appealStatus" IS NULL;

    CREATE INDEX IF NOT EXISTS idx_merchant_order_completion_reply_due
      ON merchant_order (
        "tenantId", "merchantId", "completionReplyNextRetryAt", "platformCreatedAt"
      )
      WHERE "completionReplyStatus" IS NULL OR
        "completionReplyStatus" IN ('PENDING', 'SENDING', 'FAILED');
  `)
}

export class C2cFullProviderParity1789024000000 implements MigrationInterface {
  readonly name = 'C2cFullProviderParity1789024000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cFullProviderParity(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('C2C full provider parity migration is forward-only')
  }
}
