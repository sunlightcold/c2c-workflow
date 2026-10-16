import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cIpProxies(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789030000)')
  await manager.query(`
    CREATE TABLE ip_proxy (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      name varchar(100) NOT NULL,
      protocol varchar(16) NOT NULL CHECK (protocol IN ('http','https','socks5','socks5h')),
      host varchar(255) NOT NULL,
      port integer NOT NULL CHECK (port BETWEEN 1 AND 65535),
      username varchar(255) NOT NULL DEFAULT '',
      "passwordRef" text NOT NULL,
      "passwordConfigured" boolean NOT NULL DEFAULT false,
      fingerprint varchar(64) NOT NULL,
      "batchFingerprint" varchar(64) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
      "expiresAt" timestamptz,
      "expiryWarnDays" integer NOT NULL DEFAULT 7 CHECK ("expiryWarnDays" >= 0),
      "fallbackMode" varchar(16) NOT NULL DEFAULT 'none' CHECK ("fallbackMode" IN ('none','proxy','direct')),
      "backupProxyId" uuid,
      "lastTest" jsonb,
      "lastQuality" jsonb,
      CONSTRAINT uq_ip_proxy_scope_fingerprint UNIQUE ("tenantId",fingerprint),
      CONSTRAINT uq_ip_proxy_id_scope UNIQUE (id,"tenantId"),
      CONSTRAINT ck_ip_proxy_backup_self CHECK ("backupProxyId" IS DISTINCT FROM id),
      CONSTRAINT fk_ip_proxy_backup_scope FOREIGN KEY ("backupProxyId","tenantId")
        REFERENCES ip_proxy(id,"tenantId") ON DELETE RESTRICT
    );
    CREATE INDEX idx_ip_proxy_batch ON ip_proxy ("tenantId","batchFingerprint");
    ALTER TABLE merchant ADD COLUMN "proxyId" uuid;
    ALTER TABLE merchant ADD CONSTRAINT fk_merchant_proxy_scope
      FOREIGN KEY ("proxyId","tenantId") REFERENCES ip_proxy(id,"tenantId") ON DELETE RESTRICT;
    CREATE INDEX idx_merchant_proxy ON merchant ("tenantId","proxyId");
  `)
  const [result] = await manager.query(`
    SELECT count(*)::int AS count FROM pg_constraint
    WHERE connamespace = current_schema()::regnamespace
      AND conname IN ('fk_merchant_proxy_scope','uq_ip_proxy_scope_fingerprint','uq_ip_proxy_id_scope')
  `)
  if (result.count !== 3) throw new Error('IP proxy migration constraint validation failed')
}

export class C2cIpProxies1789030000000 implements MigrationInterface {
  name = 'C2cIpProxies1789030000000'
  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cIpProxies(queryRunner.manager)
  }
  async down(): Promise<void> {
    throw new Error('Forward-only migration')
  }
}
