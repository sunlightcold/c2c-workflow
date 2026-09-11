import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const MIGRATION_LOCK_ID = 1_789_012_000

export async function migratePaymentAccountCredentials(manager: EntityManager): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)
  await manager.query(`
    ALTER TABLE payment_account
      ALTER COLUMN "credentialRef" TYPE text,
      ADD COLUMN IF NOT EXISTS "credentialAuthMode" varchar(8),
      ADD COLUMN IF NOT EXISTS "credentialAppId" varchar(64),
      ADD COLUMN IF NOT EXISTS "credentialGateway" varchar(255),
      ADD COLUMN IF NOT EXISTS "credentialUpdatedAt" timestamptz;

    DO $$ BEGIN
      ALTER TABLE payment_account ADD CONSTRAINT ck_payment_account_credential_auth_mode
        CHECK ("credentialAuthMode" IS NULL OR "credentialAuthMode" IN ('KEY', 'CERT'));
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  `)
}

export async function readPaymentAccountCredentialState(manager: EntityManager) {
  const columns = await manager.query<Array<{ column_name: string; data_type: string }>>(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'payment_account'
      AND column_name = ANY(ARRAY[
        'credentialRef',
        'credentialAuthMode',
        'credentialAppId',
        'credentialGateway',
        'credentialUpdatedAt'
      ])
    ORDER BY column_name
  `)
  return columns
}

export class PaymentAccountCredentials1789012000000 implements MigrationInterface {
  readonly name = 'PaymentAccountCredentials1789012000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migratePaymentAccountCredentials(queryRunner.manager)
    const columns = await readPaymentAccountCredentialState(queryRunner.manager)
    if (columns.length !== 5) {
      throw new Error(
        `Payment account credential migration is incomplete: ${JSON.stringify(columns)}`,
      )
    }
    const credentialRef = columns.find(({ column_name }) => column_name === 'credentialRef')
    if (credentialRef?.data_type !== 'text') {
      throw new Error('Payment account credential storage must use text')
    }
  }

  async down(): Promise<void> {
    throw new Error('Payment account credential migration is forward-only')
  }
}
