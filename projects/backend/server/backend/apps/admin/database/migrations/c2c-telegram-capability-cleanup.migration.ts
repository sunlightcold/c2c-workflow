import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const capabilityTables = ['telegram_bot', 'telegram_group', 'telegram_group_member'] as const

export async function cleanupTelegramCapabilities(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789019000)')
  for (const table of capabilityTables) {
    await manager.query(`
      UPDATE ${table}
      SET capabilities = ARRAY(
        SELECT DISTINCT CASE
          WHEN capability = 'MANUAL_PAYMENT' THEN 'ALIPAY_BATCH_PAYMENT'
          ELSE capability
        END
        FROM unnest(capabilities) AS capability
        WHERE capability NOT IN (
          'BALANCE_QUERY',
          'PAYMENT_RESULT_NOTIFICATION',
          'GROUP_MEMBER_MANAGE'
        )
      )
      WHERE capabilities && ARRAY[
        'MANUAL_PAYMENT',
        'BALANCE_QUERY',
        'PAYMENT_RESULT_NOTIFICATION',
        'GROUP_MEMBER_MANAGE'
      ]::varchar[]
    `)
  }
}

export class C2cTelegramCapabilityCleanup1789019000000 implements MigrationInterface {
  readonly name = 'C2cTelegramCapabilityCleanup1789019000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await cleanupTelegramCapabilities(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('Telegram capability cleanup is forward-only')
  }
}
