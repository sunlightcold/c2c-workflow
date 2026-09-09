import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentOrders(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789001000)')
  await manager.query(`
    DO $$ BEGIN CREATE TYPE payment_source_type_enum AS ENUM ('C2C_BUY', 'BOT_MANUAL', 'REFUND');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE payment_order_status_enum AS ENUM (
      'CREATED', 'READY', 'SUBMITTING', 'PROCESSING', 'UNKNOWN', 'SUCCESS', 'FAILED', 'CANCELLED',
      'PLATFORM_CONFIRM_PENDING', 'COMPLETED', 'FUND_EXCEPTION'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE TABLE IF NOT EXISTS payment_order (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL REFERENCES tenant(id),
      "merchantId" uuid NOT NULL REFERENCES merchant(id), "sourceType" payment_source_type_enum NOT NULL,
      "sourceBusinessNo" varchar(128) NOT NULL, "paymentNo" varchar(64) NOT NULL,
      amount decimal(20,2) NOT NULL CHECK (amount > 0), currency varchar(16) NOT NULL,
      "payeeIdentity" varchar(255) NOT NULL, "payeeName" varchar(128) NOT NULL,
      "paymentPlanId" uuid NOT NULL REFERENCES merchant_payment_plan(id),
      "paymentAccountId" uuid NOT NULL REFERENCES payment_account(id),
      "paymentAccountChannelId" uuid NOT NULL REFERENCES payment_account_channel(id),
      status payment_order_status_enum NOT NULL, "upstreamId" varchar(128), "lastError" varchar(512),
      version integer NOT NULL DEFAULT 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_source
      ON payment_order ("tenantId", "merchantId", "sourceType", "sourceBusinessNo");
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_order_no ON payment_order ("paymentNo");
    CREATE TABLE IF NOT EXISTS payment_attempt (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL REFERENCES tenant(id),
      "merchantId" uuid NOT NULL REFERENCES merchant(id),
      "paymentOrderId" uuid NOT NULL REFERENCES payment_order(id), "idempotencyKey" varchar(160) NOT NULL,
      operation varchar(64) NOT NULL, "resultStatus" payment_order_status_enum NOT NULL,
      "upstreamId" varchar(128), "errorMessage" varchar(512)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempt_idempotency ON payment_attempt ("idempotencyKey");
    CREATE TABLE IF NOT EXISTS payment_order_status_history (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(), "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(), "tenantId" uuid NOT NULL REFERENCES tenant(id),
      "merchantId" uuid NOT NULL REFERENCES merchant(id), "paymentOrderId" uuid NOT NULL REFERENCES payment_order(id),
      "fromStatus" payment_order_status_enum NOT NULL, "toStatus" payment_order_status_enum NOT NULL,
      source varchar(64) NOT NULL, reason varchar(512)
    );
    CREATE INDEX IF NOT EXISTS idx_payment_order_history
      ON payment_order_status_history ("paymentOrderId", "createdAt");
  `)
}

export class C2cPaymentOrders1789001000000 implements MigrationInterface {
  readonly name = 'C2cPaymentOrders1789001000000'
  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentOrders(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::text AS count FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1)`,
      [['payment_order', 'payment_attempt', 'payment_order_status_history']],
    )) as Array<{ count: string }>
    if (count !== '3') throw new Error('C2C payment order migration is incomplete')
  }
  async down(): Promise<void> {
    throw new Error('C2C payment order migration is forward-only')
  }
}
