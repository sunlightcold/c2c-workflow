import type { MigrationInterface, QueryRunner } from 'typeorm'

export async function migrateC2cPaymentPlanAutomation(
  queryRunner: Pick<QueryRunner, 'query'>,
): Promise<void> {
  await queryRunner.query(`
    ALTER TABLE merchant_payment_plan
    ADD COLUMN IF NOT EXISTS "automaticPaymentEnabled" boolean NOT NULL DEFAULT false
  `)
  await queryRunner.query(`
    UPDATE merchant_payment_plan plan
    SET "automaticPaymentEnabled" = true
    FROM merchant,
         payment_account_channel account_channel,
         payment_channel channel
    WHERE merchant.id = plan."merchantId"
      AND merchant."tenantId" = plan."tenantId"
      AND merchant."automaticPaymentEnabled" = true
      AND account_channel.id = plan."paymentAccountChannelId"
      AND channel.id = account_channel."channelId"
      AND channel."executionMode" = merchant."automaticPaymentExecutionMode"
  `)
  await queryRunner.query(`
    CREATE INDEX IF NOT EXISTS idx_merchant_payment_plan_automatic_match
    ON merchant_payment_plan ("tenantId", "merchantId", scene, currency, priority)
    WHERE status = 'active' AND "automaticPaymentEnabled" = true
  `)
}

export class C2cPaymentPlanAutomation1789021000000 implements MigrationInterface {
  readonly name = 'C2cPaymentPlanAutomation1789021000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaymentPlanAutomation(queryRunner)
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_merchant_payment_plan_automatic_match`)
    await queryRunner.query(`
      ALTER TABLE merchant_payment_plan
      DROP COLUMN IF EXISTS "automaticPaymentEnabled"
    `)
  }
}
