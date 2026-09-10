import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cMerchantPlatformCredentials(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789003000)')
  await manager.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_id_tenant ON merchant (id, "tenantId");

    CREATE TABLE IF NOT EXISTS merchant_platform_credential (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      platform merchant_platform_enum NOT NULL,
      version integer NOT NULL,
      "credentialRef" varchar(255) NOT NULL,
      "clientType" varchar(32),
      "xUserId" varchar(64),
      "requestTimeoutMs" integer NOT NULL DEFAULT 5000,
      status business_status_enum NOT NULL DEFAULT 'active',
      CONSTRAINT fk_merchant_platform_credential_scope
        FOREIGN KEY ("merchantId", "tenantId") REFERENCES merchant(id, "tenantId") ON DELETE RESTRICT,
      CONSTRAINT ck_merchant_platform_credential_version CHECK (version > 0),
      CONSTRAINT ck_merchant_platform_credential_ref CHECK (length(btrim("credentialRef")) >= 8),
      CONSTRAINT ck_merchant_platform_credential_timeout CHECK ("requestTimeoutMs" BETWEEN 1000 AND 60000),
      CONSTRAINT ck_merchant_platform_credential_fields CHECK (
        (platform = 'BINANCE' AND "clientType" IS NOT NULL AND length(btrim("clientType")) > 0)
        OR (platform = 'OKX' AND "clientType" IS NULL AND "xUserId" IS NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_platform_credential_version
      ON merchant_platform_credential ("merchantId", version);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_platform_credential_active
      ON merchant_platform_credential ("merchantId") WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_merchant_platform_credential_scope
      ON merchant_platform_credential ("tenantId", "merchantId");
  `)
}

export class C2cMerchantPlatformCredentials1789003000000 implements MigrationInterface {
  readonly name = 'C2cMerchantPlatformCredentials1789003000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cMerchantPlatformCredentials(queryRunner.manager)
    const [state] = (await queryRunner.query(`
      SELECT
        to_regclass(current_schema() || '.merchant_platform_credential') IS NOT NULL AS "tableExists",
        COUNT(*) FILTER (WHERE indexname IN (
          'uq_merchant_platform_credential_version',
          'uq_merchant_platform_credential_active',
          'idx_merchant_platform_credential_scope'
        ))::text AS "indexCount"
      FROM pg_indexes
      WHERE schemaname = current_schema()
    `)) as Array<{ tableExists: boolean; indexCount: string }>
    if (!state.tableExists || state.indexCount !== '3') {
      throw new Error('C2C merchant platform credential migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('C2C merchant platform credential migration is forward-only')
  }
}
