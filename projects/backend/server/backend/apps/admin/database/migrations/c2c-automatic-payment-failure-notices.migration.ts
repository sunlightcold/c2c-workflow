import type { MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cAutomaticPaymentFailureNotices(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  await queryRunner.query(`
    CREATE TABLE IF NOT EXISTS automatic_payment_failure_notice (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
      "merchantId" uuid NOT NULL REFERENCES merchant(id) ON DELETE CASCADE,
      code varchar(64) NOT NULL,
      "referenceId" varchar(160) NOT NULL,
      message varchar(512) NOT NULL,
      "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT uq_automatic_payment_failure_notice_scope
        UNIQUE ("tenantId", "merchantId", code, "referenceId")
    )
  `)
  const [result] = (await queryRunner.query(`
    SELECT to_regclass('automatic_payment_failure_notice') IS NOT NULL AS present
  `)) as Array<{ present: boolean }>
  if (!result?.present) throw new Error('Automatic payment failure notice migration is incomplete')
}

export class C2cAutomaticPaymentFailureNotices1789022000000 implements MigrationInterface {
  readonly name = 'C2cAutomaticPaymentFailureNotices1789022000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cAutomaticPaymentFailureNotices(queryRunner)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS automatic_payment_failure_notice`)
  }
}
