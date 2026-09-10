import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentBatches(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789005000)')
  await manager.query(`
    DO $$ BEGIN CREATE TYPE payment_batch_status_enum AS ENUM (
      'DRAFT', 'PENDING_REVIEW', 'READY', 'SUBMITTING', 'PROCESSING', 'SUCCESS',
      'PARTIAL_SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED', 'EXCEPTION'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE payment_batch_item_status_enum AS ENUM (
      'QUEUED', 'SUBMITTING', 'PROCESSING', 'SUCCESS', 'FAILED', 'UNKNOWN', 'CANCELLED'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_account_id_tenant
      ON payment_account (id, "tenantId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_id_scope
      ON payment_order (id, "tenantId", "merchantId");

    CREATE TABLE IF NOT EXISTS payment_batch (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      "batchNo" varchar(64) NOT NULL,
      "paymentAccountId" uuid NOT NULL,
      "paymentAccountChannelId" uuid NOT NULL REFERENCES payment_account_channel(id) ON DELETE RESTRICT,
      currency varchar(16) NOT NULL,
      "totalCount" integer NOT NULL CHECK ("totalCount" BETWEEN 1 AND 500),
      "totalAmount" decimal(20,2) NOT NULL CHECK ("totalAmount" > 0),
      "successCount" integer NOT NULL DEFAULT 0 CHECK ("successCount" >= 0),
      "failedCount" integer NOT NULL DEFAULT 0 CHECK ("failedCount" >= 0),
      "processingCount" integer NOT NULL DEFAULT 0 CHECK ("processingCount" >= 0),
      "unknownCount" integer NOT NULL DEFAULT 0 CHECK ("unknownCount" >= 0),
      "upstreamId" varchar(128),
      status payment_batch_status_enum NOT NULL,
      "lastError" varchar(512),
      version integer NOT NULL DEFAULT 1,
      CONSTRAINT fk_payment_batch_merchant_scope FOREIGN KEY ("merchantId", "tenantId")
        REFERENCES merchant(id, "tenantId") ON DELETE RESTRICT,
      CONSTRAINT fk_payment_batch_account_scope FOREIGN KEY ("paymentAccountId", "tenantId")
        REFERENCES payment_account(id, "tenantId") ON DELETE RESTRICT,
      CONSTRAINT ck_payment_batch_counts CHECK (
        "successCount" + "failedCount" + "processingCount" + "unknownCount" <= "totalCount"
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_no ON payment_batch ("batchNo");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_scope_id
      ON payment_batch (id, "tenantId", "merchantId");
    CREATE INDEX IF NOT EXISTS idx_payment_batch_scope_status
      ON payment_batch ("tenantId", "merchantId", status, "createdAt");

    CREATE TABLE IF NOT EXISTS payment_batch_item (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      "batchId" uuid NOT NULL,
      "paymentOrderId" uuid NOT NULL,
      amount decimal(20,2) NOT NULL CHECK (amount > 0),
      status payment_batch_item_status_enum NOT NULL,
      "upstreamId" varchar(128),
      "errorCode" varchar(128),
      "errorMessage" varchar(512),
      version integer NOT NULL DEFAULT 1,
      CONSTRAINT fk_payment_batch_item_batch_scope
        FOREIGN KEY ("batchId", "tenantId", "merchantId")
        REFERENCES payment_batch(id, "tenantId", "merchantId") ON DELETE RESTRICT,
      CONSTRAINT fk_payment_batch_item_order_scope
        FOREIGN KEY ("paymentOrderId", "tenantId", "merchantId")
        REFERENCES payment_order(id, "tenantId", "merchantId") ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_item_order
      ON payment_batch_item ("batchId", "paymentOrderId");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_item_active_order
      ON payment_batch_item ("paymentOrderId")
      WHERE status IN ('QUEUED', 'SUBMITTING', 'PROCESSING', 'UNKNOWN');
    CREATE INDEX IF NOT EXISTS idx_payment_batch_item_batch_status
      ON payment_batch_item ("batchId", status);

    CREATE TABLE IF NOT EXISTS payment_batch_status_history (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "merchantId" uuid NOT NULL,
      "batchId" uuid NOT NULL,
      "fromStatus" payment_batch_status_enum,
      "toStatus" payment_batch_status_enum NOT NULL,
      source varchar(64) NOT NULL,
      reason varchar(512),
      CONSTRAINT fk_payment_batch_history_scope
        FOREIGN KEY ("batchId", "tenantId", "merchantId")
        REFERENCES payment_batch(id, "tenantId", "merchantId") ON DELETE RESTRICT
    );
    CREATE INDEX IF NOT EXISTS idx_payment_batch_status_history
      ON payment_batch_status_history ("tenantId", "merchantId", "batchId", "createdAt");
  `)
}

export class C2cPaymentBatches1789005000000 implements MigrationInterface {
  readonly name = 'C2cPaymentBatches1789005000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentBatches(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1)`,
      [['payment_batch', 'payment_batch_item', 'payment_batch_status_history']],
    )) as Array<{ count: string }>
    if (count !== '3') throw new Error('C2C payment batch migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C payment batch migration is forward-only')
  }
}
