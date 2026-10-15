import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cMerchantAds(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789029000)')
  await manager.query(`
    CREATE TABLE IF NOT EXISTS merchant_ad (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      platform merchant_platform_enum NOT NULL,
      "platformAdId" varchar(128) NOT NULL,
      asset varchar(16) NOT NULL,
      "fiatCurrency" varchar(16) NOT NULL,
      side varchar(8) NOT NULL DEFAULT 'BUY',
      price decimal(36,18) NOT NULL,
      status varchar(16) NOT NULL,
      "paymentMethods" jsonb NOT NULL DEFAULT '[]'::jsonb,
      "availableAmount" decimal(36,18),
      "minFiatAmount" decimal(36,18),
      "maxFiatAmount" decimal(36,18),
      rule jsonb,
      "ruleVersion" integer NOT NULL DEFAULT 0,
      enabled boolean NOT NULL DEFAULT false,
      "nextRunAt" timestamptz,
      "lastSyncedAt" timestamptz NOT NULL,
      "lastError" varchar(512),
      "pendingRunId" uuid,
      CONSTRAINT fk_merchant_ad_merchant_scope
        FOREIGN KEY ("merchantId", "tenantId", platform)
        REFERENCES merchant(id, "tenantId", platform) ON DELETE RESTRICT,
      CONSTRAINT ck_merchant_ad_buy_usdt CHECK (side = 'BUY' AND asset = 'USDT'),
      CONSTRAINT ck_merchant_ad_status CHECK (status IN ('ONLINE', 'OFFLINE', 'UNKNOWN')),
      CONSTRAINT ck_merchant_ad_price CHECK (price > 0),
      CONSTRAINT ck_merchant_ad_rule_version CHECK ("ruleVersion" >= 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ad_scope_platform_ad
      ON merchant_ad ("tenantId", "merchantId", "platformAdId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_ad_id_scope
      ON merchant_ad (id, "tenantId", "merchantId");
    CREATE INDEX IF NOT EXISTS idx_merchant_ad_scope
      ON merchant_ad ("tenantId", "merchantId", "createdAt");
    CREATE INDEX IF NOT EXISTS idx_merchant_ad_due
      ON merchant_ad ("nextRunAt") WHERE enabled = true;

    CREATE TABLE IF NOT EXISTS merchant_ad_run (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      "adId" uuid NOT NULL,
      "ruleVersion" integer NOT NULL,
      rule jsonb NOT NULL,
      trigger varchar(16) NOT NULL,
      status varchar(16) NOT NULL,
      "currentPrice" decimal(36,18),
      "targetPrice" decimal(36,18),
      "actualPrice" decimal(36,18),
      "platformAdId" varchar(128) NOT NULL,
      "resultPlatformAdId" varchar(128),
      evidence jsonb,
      reason varchar(512) NOT NULL,
      "createdBy" varchar(128),
      "finishedAt" timestamptz,
      CONSTRAINT fk_merchant_ad_run_scope
        FOREIGN KEY ("adId", "tenantId", "merchantId")
        REFERENCES merchant_ad(id, "tenantId", "merchantId") ON DELETE RESTRICT,
      CONSTRAINT ck_merchant_ad_run_trigger CHECK (trigger IN ('PREVIEW', 'MANUAL', 'AUTO')),
      CONSTRAINT ck_merchant_ad_run_status
        CHECK (status IN ('READY', 'HOLD', 'BLOCKED', 'PENDING', 'APPLIED', 'FAILED'))
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_ad_run_scope
      ON merchant_ad_run ("tenantId", "merchantId", "adId", "createdAt");
    CREATE INDEX IF NOT EXISTS idx_merchant_ad_run_pending
      ON merchant_ad_run (status, "createdAt") WHERE status = 'PENDING';
  `)
}

export class C2cMerchantAds1789029000000 implements MigrationInterface {
  readonly name = 'C2cMerchantAds1789029000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cMerchantAds(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(`
      SELECT COUNT(*)::text AS count FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name IN ('merchant_ad', 'merchant_ad_run')
    `)) as Array<{ count: string }>
    if (count !== '2') throw new Error('C2C merchant advertisement migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C merchant advertisement migration is forward-only')
  }
}
