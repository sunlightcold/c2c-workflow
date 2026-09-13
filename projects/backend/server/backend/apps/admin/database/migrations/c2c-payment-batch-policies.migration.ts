import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentBatchPolicies(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789017000)')
  await manager.query(`
    DO $$ BEGIN CREATE TYPE payment_batch_rule_type_enum AS ENUM (
      'MANUAL', 'INTERVAL', 'ORDER_COUNT'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE payment_batch_policy_scope_enum AS ENUM (
      'GLOBAL', 'MERCHANT'
    ); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS payment_batch_policy (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "scopeType" payment_batch_policy_scope_enum NOT NULL,
      "merchantId" uuid,
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      status business_status_enum NOT NULL DEFAULT 'active',
      CONSTRAINT ck_payment_batch_policy_scope CHECK (
        ("scopeType" = 'GLOBAL' AND "merchantId" IS NULL)
        OR ("scopeType" = 'MERCHANT' AND "merchantId" IS NOT NULL)
      ),
      CONSTRAINT fk_payment_batch_policy_merchant_scope
        FOREIGN KEY ("merchantId", "tenantId")
        REFERENCES merchant(id, "tenantId") ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_policy_tenant_code
      ON payment_batch_policy ("tenantId", code);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_policy_scope_id
      ON payment_batch_policy (id, "tenantId");
    CREATE INDEX IF NOT EXISTS idx_payment_batch_policy_scope
      ON payment_batch_policy ("tenantId", "merchantId", status);

    CREATE TABLE IF NOT EXISTS payment_batch_policy_rule (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "policyId" uuid NOT NULL,
      "ruleType" payment_batch_rule_type_enum NOT NULL,
      "intervalSeconds" integer,
      "orderCount" integer,
      status business_status_enum NOT NULL DEFAULT 'active',
      CONSTRAINT fk_payment_batch_policy_rule_scope
        FOREIGN KEY ("policyId", "tenantId")
        REFERENCES payment_batch_policy(id, "tenantId") ON DELETE CASCADE,
      CONSTRAINT ck_payment_batch_policy_rule_parameters CHECK (
        ("ruleType" = 'MANUAL' AND "intervalSeconds" IS NULL AND "orderCount" IS NULL)
        OR ("ruleType" = 'INTERVAL' AND "intervalSeconds" BETWEEN 10 AND 86400 AND "orderCount" IS NULL)
        OR ("ruleType" = 'ORDER_COUNT' AND "orderCount" BETWEEN 1 AND 500 AND "intervalSeconds" IS NULL)
      )
    );
    CREATE INDEX IF NOT EXISTS idx_payment_batch_policy_rule_scope
      ON payment_batch_policy_rule ("tenantId", "policyId", status);

    ALTER TABLE merchant_payment_plan
      ADD COLUMN IF NOT EXISTS "batchPolicyId" uuid;
    ALTER TABLE payment_order
      ADD COLUMN IF NOT EXISTS "batchPolicyId" uuid;
    ALTER TABLE payment_batch
      ADD COLUMN IF NOT EXISTS "batchPolicyId" uuid,
      ADD COLUMN IF NOT EXISTS "triggerRuleIds" jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS "triggerSource" varchar(32) NOT NULL DEFAULT 'MANUAL';

    DO $$ BEGIN
      ALTER TABLE merchant_payment_plan ADD CONSTRAINT fk_merchant_payment_plan_batch_policy
        FOREIGN KEY ("batchPolicyId", "tenantId")
        REFERENCES payment_batch_policy(id, "tenantId") ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE payment_order ADD CONSTRAINT fk_payment_order_batch_policy
        FOREIGN KEY ("batchPolicyId", "tenantId")
        REFERENCES payment_batch_policy(id, "tenantId") ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN
      ALTER TABLE payment_batch ADD CONSTRAINT fk_payment_batch_policy
        FOREIGN KEY ("batchPolicyId", "tenantId")
        REFERENCES payment_batch_policy(id, "tenantId") ON DELETE RESTRICT;
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
}

export class C2cPaymentBatchPolicies1789017000000 implements MigrationInterface {
  readonly name = 'C2cPaymentBatchPolicies1789017000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentBatchPolicies(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
       WHERE table_schema = current_schema()
         AND table_name = ANY($1)`,
      [['payment_batch_policy', 'payment_batch_policy_rule']],
    )) as Array<{ count: string }>
    if (count !== '2') throw new Error('C2C payment batch policy migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C payment batch policy migration is forward-only')
  }
}
