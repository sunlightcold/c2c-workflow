import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cMerchantOrders(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789004000)')
  await manager.query(`
    DO $$ BEGIN CREATE TYPE merchant_order_side_enum AS ENUM ('BUY', 'SELL');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE merchant_order_status_enum AS ENUM (
      'NEW', 'PENDING_PAYMENT', 'PAYMENT_PROCESSING', 'PAID_PENDING_PLATFORM_CONFIRM',
      'PENDING_RELEASE', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED',
      'FUNDS_EXCEPTION', 'EXCEPTION'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_id_tenant_platform
      ON merchant (id, "tenantId", platform);

    CREATE TABLE IF NOT EXISTS merchant_order (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      platform merchant_platform_enum NOT NULL,
      "platformOrderId" varchar(128) NOT NULL,
      side merchant_order_side_enum NOT NULL,
      "platformStatus" varchar(64) NOT NULL,
      status merchant_order_status_enum NOT NULL,
      asset varchar(16) NOT NULL,
      "assetAmount" decimal(36,18) NOT NULL CHECK ("assetAmount" > 0),
      "fiatCurrency" varchar(16) NOT NULL,
      "fiatAmount" decimal(20,2) NOT NULL CHECK ("fiatAmount" > 0),
      "unitPrice" decimal(36,18),
      "counterpartyName" varchar(128),
      "paymentMethod" varchar(32),
      "platformPaymentMethodId" varchar(128),
      "payeeIdentity" varchar(255),
      "payeeName" varchar(128),
      "identityName" varchar(128),
      "identityMatched" boolean NOT NULL DEFAULT false,
      payable boolean NOT NULL DEFAULT false,
      "paymentDeadline" timestamptz,
      "platformCreatedAt" timestamptz NOT NULL,
      "platformUpdatedAt" timestamptz,
      "lastSyncedAt" timestamptz NOT NULL,
      "lastError" varchar(512),
      version integer NOT NULL DEFAULT 1,
      CONSTRAINT fk_merchant_order_scope FOREIGN KEY ("merchantId", "tenantId", platform)
        REFERENCES merchant(id, "tenantId", platform) ON DELETE RESTRICT,
      CONSTRAINT ck_merchant_order_buy_only_v1 CHECK (side = 'BUY')
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_order_platform_order
      ON merchant_order ("merchantId", platform, "platformOrderId");
    CREATE INDEX IF NOT EXISTS idx_merchant_order_scope_status
      ON merchant_order ("tenantId", "merchantId", status, "platformCreatedAt");

    CREATE TABLE IF NOT EXISTS merchant_order_status_history (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      "merchantOrderId" uuid NOT NULL REFERENCES merchant_order(id) ON DELETE RESTRICT,
      "fromStatus" merchant_order_status_enum,
      "toStatus" merchant_order_status_enum NOT NULL,
      source varchar(64) NOT NULL,
      "platformStatus" varchar(64) NOT NULL,
      reason varchar(512),
      CONSTRAINT fk_merchant_order_history_scope FOREIGN KEY ("merchantId", "tenantId")
        REFERENCES merchant(id, "tenantId") ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_merchant_order_status_history
      ON merchant_order_status_history ("tenantId", "merchantId", "merchantOrderId", "createdAt");

    CREATE TABLE IF NOT EXISTS merchant_order_sync_checkpoint (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      cursor varchar(255),
      "windowEndAt" timestamptz,
      "lastAttemptAt" timestamptz,
      "lastSuccessAt" timestamptz,
      "nextSyncAt" timestamptz NOT NULL,
      "consecutiveFailures" integer NOT NULL DEFAULT 0 CHECK ("consecutiveFailures" >= 0),
      "lastError" varchar(512),
      "leaseOwner" varchar(128),
      "leaseExpiresAt" timestamptz,
      version integer NOT NULL DEFAULT 1,
      CONSTRAINT fk_merchant_order_checkpoint_scope FOREIGN KEY ("merchantId", "tenantId")
        REFERENCES merchant(id, "tenantId") ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_order_sync_checkpoint
      ON merchant_order_sync_checkpoint ("tenantId", "merchantId");
    CREATE INDEX IF NOT EXISTS idx_merchant_order_sync_due
      ON merchant_order_sync_checkpoint ("nextSyncAt");
  `)
}

export class C2cMerchantOrders1789004000000 implements MigrationInterface {
  readonly name = 'C2cMerchantOrders1789004000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cMerchantOrders(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(
      `
      SELECT COUNT(*)::text AS count FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1)
    `,
      [['merchant_order', 'merchant_order_status_history', 'merchant_order_sync_checkpoint']],
    )) as Array<{
      count: string
    }>
    if (count !== '3') throw new Error('C2C merchant order migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C merchant order migration is forward-only')
  }
}
