import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cMerchantAccountOperations(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789006000)')
  await manager.query(`
    ALTER TABLE merchant
      ADD COLUMN IF NOT EXISTS "apiBaseUrl" varchar(255),
      ADD COLUMN IF NOT EXISTS "pageSize" integer NOT NULL DEFAULT 20,
      ADD COLUMN IF NOT EXISTS "overlapSeconds" integer NOT NULL DEFAULT 120,
      ADD COLUMN IF NOT EXISTS "orderStatusList" integer[] NOT NULL DEFAULT ARRAY[1]::integer[],
      ADD COLUMN IF NOT EXISTS "requestTimeoutMs" integer NOT NULL DEFAULT 15000,
      ADD COLUMN IF NOT EXISTS "paidConfirmIntervalMinMs" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "paidConfirmIntervalMaxMs" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "botCode" varchar(64),
      ADD COLUMN IF NOT EXISTS "chatId" varchar(64),
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCreatedEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCreatedMessage" varchar(500),
      ADD COLUMN IF NOT EXISTS "c2cChatOrderPaidEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "c2cChatOrderPaidMessage" varchar(500),
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCompletedEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "c2cChatOrderCompletedMessage" varchar(500),
      ADD COLUMN IF NOT EXISTS "autoAppealEnabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "autoAppealDelayMinutes" integer NOT NULL DEFAULT 18,
      ADD COLUMN IF NOT EXISTS description varchar(500);

    UPDATE merchant SET "apiBaseUrl" = CASE platform
      WHEN 'BINANCE' THEN 'https://api.binance.com'
      ELSE 'https://www.okx.com'
    END WHERE "apiBaseUrl" IS NULL;
    ALTER TABLE merchant ALTER COLUMN "apiBaseUrl" SET NOT NULL;

    ALTER TABLE merchant_platform_credential
      ALTER COLUMN "credentialRef" TYPE text,
      ADD COLUMN IF NOT EXISTS "authMode" varchar(16),
      ADD COLUMN IF NOT EXISTS "apiBaseUrl" varchar(255);
    UPDATE merchant_platform_credential credential SET
      "authMode" = CASE credential.platform WHEN 'BINANCE' THEN 'API_KEY' ELSE 'WEB_COOKIE' END,
      "apiBaseUrl" = merchant."apiBaseUrl"
    FROM merchant
    WHERE credential."merchantId" = merchant.id
      AND (credential."authMode" IS NULL OR credential."apiBaseUrl" IS NULL);
    ALTER TABLE merchant_platform_credential
      ALTER COLUMN "authMode" SET NOT NULL,
      ALTER COLUMN "apiBaseUrl" SET NOT NULL;

    DO $$ BEGIN
      ALTER TABLE merchant ADD CONSTRAINT ck_merchant_account_page_size
        CHECK ("pageSize" BETWEEN 1 AND 100);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE merchant ADD CONSTRAINT ck_merchant_account_overlap
        CHECK ("overlapSeconds" BETWEEN 0 AND 3600);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE merchant ADD CONSTRAINT ck_merchant_account_timeout
        CHECK ("requestTimeoutMs" BETWEEN 1000 AND 60000);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE merchant ADD CONSTRAINT ck_merchant_account_paid_interval
        CHECK (
          "paidConfirmIntervalMinMs" BETWEEN 0 AND 60000
          AND "paidConfirmIntervalMaxMs" BETWEEN 0 AND 60000
          AND "paidConfirmIntervalMinMs" <= "paidConfirmIntervalMaxMs"
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE merchant ADD CONSTRAINT ck_merchant_account_auto_appeal_delay
        CHECK ("autoAppealDelayMinutes" BETWEEN 1 AND 1440);
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE merchant_platform_credential ADD CONSTRAINT ck_merchant_credential_auth_mode
        CHECK (
          (platform = 'BINANCE' AND "authMode" = 'API_KEY')
          OR (platform = 'OKX' AND "authMode" = 'WEB_COOKIE')
        );
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
}

export class C2cMerchantAccountOperations1789006000000 implements MigrationInterface {
  readonly name = 'C2cMerchantAccountOperations1789006000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cMerchantAccountOperations(queryRunner.manager)
    const [state] = (await queryRunner.query(`
      SELECT COUNT(*)::text AS count
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'merchant'
        AND column_name = ANY(ARRAY[
          'apiBaseUrl', 'pageSize', 'overlapSeconds', 'orderStatusList', 'requestTimeoutMs',
          'paidConfirmIntervalMinMs', 'paidConfirmIntervalMaxMs', 'botCode', 'chatId',
          'c2cChatOrderCreatedEnabled', 'c2cChatOrderCreatedMessage',
          'c2cChatOrderPaidEnabled', 'c2cChatOrderPaidMessage',
          'c2cChatOrderCompletedEnabled', 'c2cChatOrderCompletedMessage',
          'autoAppealEnabled', 'autoAppealDelayMinutes', 'description'
        ])
    `)) as Array<{ count: string }>
    if (state.count !== '18')
      throw new Error('C2C merchant account operations migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C merchant account operations migration is forward-only')
  }
}
