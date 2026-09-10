import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cMerchantOrderAppeals(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789007000)')
  await manager.query(`
    DO $$ BEGIN
      CREATE TYPE merchant_order_appeal_status_enum AS ENUM ('PROCESSING', 'SUBMITTED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    ALTER TABLE merchant_order
      ADD COLUMN IF NOT EXISTS "appealStatus" merchant_order_appeal_status_enum,
      ADD COLUMN IF NOT EXISTS "appealReasonCode" integer,
      ADD COLUMN IF NOT EXISTS "appealReason" varchar(255),
      ADD COLUMN IF NOT EXISTS "appealComplaintNo" varchar(128),
      ADD COLUMN IF NOT EXISTS "appealClaimedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "appealSubmittedAt" timestamptz,
      ADD COLUMN IF NOT EXISTS "appealLastError" varchar(512);

    CREATE INDEX IF NOT EXISTS idx_merchant_order_appeal_status
      ON merchant_order ("tenantId", "merchantId", "appealStatus", "platformCreatedAt");
  `)
}

export class C2cMerchantOrderAppeals1789007000000 implements MigrationInterface {
  readonly name = 'C2cMerchantOrderAppeals1789007000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cMerchantOrderAppeals(queryRunner.manager)
    const [{ count }] = (await queryRunner.query(
      `SELECT COUNT(*)::text AS count
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'merchant_order'
         AND column_name = ANY($1)`,
      [
        [
          'appealStatus',
          'appealReasonCode',
          'appealReason',
          'appealComplaintNo',
          'appealClaimedAt',
          'appealSubmittedAt',
          'appealLastError',
        ],
      ],
    )) as Array<{ count: string }>
    if (count !== '7') throw new Error('C2C merchant order appeal migration is incomplete')
  }

  async down(): Promise<void> {
    throw new Error('C2C merchant order appeal migration is forward-only')
  }
}
