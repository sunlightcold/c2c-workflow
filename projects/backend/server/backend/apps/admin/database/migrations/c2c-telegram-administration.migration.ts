import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const TABLES = [
  'telegram_bot',
  'telegram_group',
  'telegram_group_member',
  'telegram_super_admin',
] as const

export async function migrateTelegramAdministration(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789008000)')
  await manager.query(`
    DO $$ BEGIN
      CREATE TYPE telegram_group_binding_state_enum AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'UNBOUND');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE telegram_bot_type_enum AS ENUM ('HQ', 'MERCHANT', 'PAYMENT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      CREATE TYPE telegram_super_admin_scope_type_enum AS ENUM ('ALL_GROUPS', 'SPECIFIED_GROUPS');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS telegram_bot (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      "botType" telegram_bot_type_enum NOT NULL,
      "tokenRef" varchar(255) NOT NULL,
      "webhookSecretRef" varchar(255),
      "webhookUrl" varchar(500),
      language varchar(16) NOT NULL DEFAULT 'zh-CN',
      capabilities varchar[] NOT NULL,
      "paymentOrderRequireConfirmation" boolean NOT NULL DEFAULT true,
      "batchSubmitRequireConfirmation" boolean NOT NULL DEFAULT true,
      status business_status_enum NOT NULL DEFAULT 'active',
      description varchar(500),
      CONSTRAINT ck_telegram_bot_capabilities_not_empty CHECK (cardinality(capabilities) > 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_bot_tenant_code
      ON telegram_bot ("tenantId", code);
    CREATE INDEX IF NOT EXISTS idx_telegram_bot_tenant ON telegram_bot ("tenantId");

    CREATE TABLE IF NOT EXISTS telegram_group (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "botId" uuid NOT NULL REFERENCES telegram_bot(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL REFERENCES merchant(id) ON DELETE RESTRICT,
      name varchar(100) NOT NULL,
      "chatId" varchar(32),
      "chatType" varchar(32),
      "paymentScene" payment_source_type_enum NOT NULL,
      capabilities varchar[] NOT NULL,
      "notificationEvents" varchar[] NOT NULL DEFAULT ARRAY[]::varchar[],
      "notificationsEnabled" boolean NOT NULL DEFAULT true,
      "bindingState" telegram_group_binding_state_enum NOT NULL DEFAULT 'PENDING',
      "verificationCodeHash" varchar(64),
      "verificationExpiresAt" timestamptz,
      "verifiedAt" timestamptz,
      description varchar(500),
      CONSTRAINT ck_telegram_group_payment_scene
        CHECK ("paymentScene" IN ('BOT_MANUAL', 'C2C_BUY')),
      CONSTRAINT ck_telegram_group_capabilities_not_empty CHECK (cardinality(capabilities) > 0),
      CONSTRAINT ck_telegram_group_binding_fields CHECK (
        ("bindingState" = 'PENDING' AND "verificationCodeHash" IS NOT NULL
          AND "verificationExpiresAt" IS NOT NULL AND "chatId" IS NULL)
        OR
        ("bindingState" <> 'PENDING' AND "verificationCodeHash" IS NULL
          AND "verificationExpiresAt" IS NULL AND "chatId" IS NOT NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_telegram_group_tenant ON telegram_group ("tenantId");
    CREATE INDEX IF NOT EXISTS idx_telegram_group_bot ON telegram_group ("tenantId", "botId");
    CREATE INDEX IF NOT EXISTS idx_telegram_group_merchant ON telegram_group ("tenantId", "merchantId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_group_active_chat
      ON telegram_group ("botId", "chatId") WHERE "bindingState" IN ('ACTIVE', 'PAUSED');

    CREATE TABLE IF NOT EXISTS telegram_group_member (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "groupId" uuid NOT NULL REFERENCES telegram_group(id) ON DELETE RESTRICT,
      "userId" integer NOT NULL REFERENCES sys_user(id) ON DELETE RESTRICT,
      "telegramUserId" varchar(32) NOT NULL,
      "telegramUsername" varchar(64),
      "displayName" varchar(100),
      role varchar(16) NOT NULL CHECK (role IN ('ADMIN', 'OPERATOR', 'VIEWER')),
      capabilities varchar[] NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active',
      CONSTRAINT ck_telegram_member_capabilities_not_empty CHECK (cardinality(capabilities) > 0)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_group_member_tg
      ON telegram_group_member ("groupId", "telegramUserId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_group_member_user
      ON telegram_group_member ("groupId", "userId");
    CREATE INDEX IF NOT EXISTS idx_telegram_group_member_tenant
      ON telegram_group_member ("tenantId");

    CREATE TABLE IF NOT EXISTS telegram_super_admin (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "userId" integer NOT NULL REFERENCES sys_user(id) ON DELETE RESTRICT,
      "telegramUserId" varchar(32) NOT NULL,
      "telegramUsername" varchar(64),
      "scopeType" telegram_super_admin_scope_type_enum NOT NULL,
      "groupIds" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      status business_status_enum NOT NULL DEFAULT 'active',
      CONSTRAINT ck_telegram_super_admin_scope CHECK (
        ("scopeType" = 'ALL_GROUPS' AND cardinality("groupIds") = 0)
        OR ("scopeType" = 'SPECIFIED_GROUPS' AND cardinality("groupIds") > 0)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_super_admin_tenant_tg
      ON telegram_super_admin ("tenantId", "telegramUserId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_super_admin_tenant_user
      ON telegram_super_admin ("tenantId", "userId");
  `)
}

export async function readTelegramAdministrationState(manager: EntityManager) {
  const rows = await manager.query<Array<{ table_name: string }>>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1) ORDER BY table_name`,
    [[...TABLES]],
  )
  return rows.map(({ table_name }) => table_name)
}

export class C2cTelegramAdministration1789008000000 implements MigrationInterface {
  readonly name = 'C2cTelegramAdministration1789008000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTelegramAdministration(queryRunner.manager)
    const tables = await readTelegramAdministrationState(queryRunner.manager)
    if (tables.length !== TABLES.length)
      throw new Error(`Telegram administration migration is incomplete: ${tables.join(',')}`)
  }

  async down(): Promise<void> {
    throw new Error('Telegram administration migration is forward-only')
  }
}
