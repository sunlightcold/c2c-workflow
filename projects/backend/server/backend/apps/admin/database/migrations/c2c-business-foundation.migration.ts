import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const MIGRATION_LOCK_ID = 1_789_000_000
const TABLES = [
  'tenant',
  'merchant',
  'payment_platform',
  'payment_channel',
  'payment_account',
  'payment_account_channel',
  'merchant_payment_plan',
] as const

export const C2C_FOUNDATION_IDS = {
  headquartersTenant: '00000000-0000-4000-8000-000000000001',
  alipayPlatform: '10000000-0000-4000-8000-000000000001',
  alipayBatchChannel: '20000000-0000-4000-8000-000000000001',
  alipayMerchantTransferChannel: '20000000-0000-4000-8000-000000000002',
} as const

export async function migrateC2cBusinessFoundation(manager: EntityManager): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)
  await manager.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  await manager.query(`
    DO $$ BEGIN CREATE TYPE business_status_enum AS ENUM ('active', 'disabled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE tenant_type_enum AS ENUM ('HEADQUARTERS_SELF', 'AGENT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE merchant_platform_enum AS ENUM ('BINANCE', 'OKX');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE payment_execution_mode_enum AS ENUM ('INSTANT', 'BATCH');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE payment_adapter_code_enum AS ENUM ('ALIPAY_BATCH', 'ALIPAY_MERCHANT_TRANSFER');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE actor_type_enum AS ENUM ('PLATFORM', 'TENANT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS tenant (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      type tenant_type_enum NOT NULL,
      code varchar(32) NOT NULL,
      name varchar(100) NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active',
      timezone varchar(64) NOT NULL DEFAULT 'Asia/Shanghai',
      "systemLocked" boolean NOT NULL DEFAULT false
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_code ON tenant (code);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_headquarters_self
      ON tenant (type) WHERE type = 'HEADQUARTERS_SELF';

    CREATE TABLE IF NOT EXISTS merchant (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      code varchar(32) NOT NULL,
      name varchar(100) NOT NULL,
      platform merchant_platform_enum NOT NULL,
      "externalMerchantId" varchar(128),
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_tenant_code ON merchant ("tenantId", code);
    CREATE INDEX IF NOT EXISTS idx_merchant_tenant ON merchant ("tenantId");

    CREATE TABLE IF NOT EXISTS payment_platform (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      code varchar(32) NOT NULL,
      name varchar(100) NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_platform_code ON payment_platform (code);

    CREATE TABLE IF NOT EXISTS payment_channel (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "platformId" uuid NOT NULL REFERENCES payment_platform(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      "executionMode" payment_execution_mode_enum NOT NULL,
      "adapterCode" payment_adapter_code_enum NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_channel_platform_code
      ON payment_channel ("platformId", code);

    CREATE TABLE IF NOT EXISTS payment_account (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "platformId" uuid NOT NULL REFERENCES payment_platform(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      "externalAccountId" varchar(128) NOT NULL,
      "credentialRef" varchar(255) NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_account_tenant_code
      ON payment_account ("tenantId", code);
    CREATE INDEX IF NOT EXISTS idx_payment_account_tenant ON payment_account ("tenantId");

    CREATE TABLE IF NOT EXISTS payment_account_channel (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "paymentAccountId" uuid NOT NULL REFERENCES payment_account(id) ON DELETE RESTRICT,
      "channelId" uuid NOT NULL REFERENCES payment_channel(id) ON DELETE RESTRICT,
      "configRef" varchar(255),
      "minimumAmount" decimal(20,2),
      "maximumAmount" decimal(20,2),
      "concurrencyLimit" integer NOT NULL DEFAULT 1 CHECK ("concurrencyLimit" > 0),
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_account_channel
      ON payment_account_channel ("paymentAccountId", "channelId");

    CREATE TABLE IF NOT EXISTS merchant_payment_plan (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL REFERENCES merchant(id) ON DELETE RESTRICT,
      scene varchar(32) NOT NULL,
      currency varchar(16) NOT NULL,
      "paymentAccountId" uuid NOT NULL REFERENCES payment_account(id) ON DELETE RESTRICT,
      "paymentAccountChannelId" uuid NOT NULL REFERENCES payment_account_channel(id) ON DELETE RESTRICT,
      priority integer NOT NULL DEFAULT 100 CHECK (priority > 0),
      weight integer NOT NULL DEFAULT 100 CHECK (weight BETWEEN 1 AND 100),
      status business_status_enum NOT NULL DEFAULT 'active'
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_payment_plan_match
      ON merchant_payment_plan ("tenantId", "merchantId", scene, currency, status);

    ALTER TABLE IF EXISTS sys_user ADD COLUMN IF NOT EXISTS "actorType" actor_type_enum NOT NULL DEFAULT 'PLATFORM';
    ALTER TABLE IF EXISTS sys_user ADD COLUMN IF NOT EXISTS "tenantId" uuid REFERENCES tenant(id) ON DELETE RESTRICT;
    ALTER TABLE IF EXISTS sys_user ADD COLUMN IF NOT EXISTS "authzVersion" integer NOT NULL DEFAULT 1;
  `)
  await manager.query(
    `INSERT INTO tenant (id, type, code, name, status, timezone, "systemLocked")
     VALUES ($1, 'HEADQUARTERS_SELF', 'HQ_SELF', '总部自营', 'active', 'Asia/Shanghai', true)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, "systemLocked" = true`,
    [C2C_FOUNDATION_IDS.headquartersTenant],
  )
  await manager.query(
    `INSERT INTO payment_platform (id, code, name, status)
     VALUES ($1, 'ALIPAY', '支付宝', 'active')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
    [C2C_FOUNDATION_IDS.alipayPlatform],
  )
  await manager.query(
    `INSERT INTO payment_channel (id, "platformId", code, name, "executionMode", "adapterCode", status)
     VALUES
       ($1, $3, 'ALIPAY_BATCH_PAY_V2', '支付宝批量有密', 'BATCH', 'ALIPAY_BATCH', 'active'),
       ($2, $3, 'ALIPAY_MERCHANT_TRANSFER', '支付宝商家转账', 'INSTANT', 'ALIPAY_MERCHANT_TRANSFER', 'active')
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status`,
    [
      C2C_FOUNDATION_IDS.alipayBatchChannel,
      C2C_FOUNDATION_IDS.alipayMerchantTransferChannel,
      C2C_FOUNDATION_IDS.alipayPlatform,
    ],
  )
}

export async function readC2cBusinessFoundationState(manager: EntityManager) {
  const tables = await manager.query<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1) ORDER BY table_name`,
    [[...TABLES]],
  )
  const seeds = await manager.query<Array<{ code: string }>>(
    `SELECT code FROM payment_channel ORDER BY code`,
  )
  return {
    tables: tables.map(({ table_name }) => table_name),
    channelCodes: seeds.map(({ code }) => code),
  }
}

export class C2cBusinessFoundation1789000000000 implements MigrationInterface {
  readonly name = 'C2cBusinessFoundation1789000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cBusinessFoundation(queryRunner.manager)
    const state = await readC2cBusinessFoundationState(queryRunner.manager)
    if (state.tables.length !== TABLES.length || state.channelCodes.length !== 2)
      throw new Error(`C2C business foundation migration is incomplete: ${JSON.stringify(state)}`)
  }

  async down(): Promise<void> {
    throw new Error('C2C business foundation migration is forward-only')
  }
}
