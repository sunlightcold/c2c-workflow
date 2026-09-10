import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentRouting(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789002000)')
  await manager.query(`
    ALTER TYPE payment_order_status_enum ADD VALUE IF NOT EXISTS 'PENDING_CONFIG' BEFORE 'CREATED';
    ALTER TABLE payment_order
      ALTER COLUMN "paymentPlanId" DROP NOT NULL,
      ALTER COLUMN "paymentAccountId" DROP NOT NULL,
      ALTER COLUMN "paymentAccountChannelId" DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS "paymentMethod" varchar(32) NOT NULL DEFAULT 'ALIPAY',
      ADD COLUMN IF NOT EXISTS "executionMode" payment_execution_mode_enum NOT NULL DEFAULT 'INSTANT';
    ALTER TABLE payment_order_status_history ALTER COLUMN "fromStatus" DROP NOT NULL;
  `)
}

export class C2cPaymentRouting1789002000000 implements MigrationInterface {
  readonly name = 'C2cPaymentRouting1789002000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentRouting(queryRunner.manager)
    const [state] = (await queryRunner.query(`
      SELECT
        COUNT(*) FILTER (WHERE column_name IN ('paymentMethod', 'executionMode'))::text AS "columnCount",
        COUNT(*) FILTER (
          WHERE column_name IN ('paymentPlanId', 'paymentAccountId', 'paymentAccountChannelId')
            AND is_nullable = 'YES'
        )::text AS "nullableRouteCount",
        COUNT(*) FILTER (WHERE column_name = 'fromStatus' AND is_nullable = 'YES')::text AS "nullableInitialStatusCount"
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name IN ('payment_order', 'payment_order_status_history')
    `)) as Array<{
      columnCount: string
      nullableRouteCount: string
      nullableInitialStatusCount: string
    }>
    if (
      state.columnCount !== '2' ||
      state.nullableRouteCount !== '3' ||
      state.nullableInitialStatusCount !== '1'
    )
      throw new Error('C2C payment routing migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C payment routing migration is forward-only')
  }
}
