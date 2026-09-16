import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const CAPABILITY = 'C2C_PAID_NOTIFICATION'

export async function migrateC2cPaidNotificationCapability(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789025000)')
  await manager.query(
    `
      UPDATE telegram_bot
      SET capabilities = array_append(capabilities, $1::varchar), "updatedAt" = now()
      WHERE "botType" = 'PAYMENT' AND NOT ($1::varchar = ANY(capabilities))
    `,
    [CAPABILITY],
  )
  await manager.query(
    `
      UPDATE telegram_group AS groups
      SET capabilities = array_append(groups.capabilities, $1::varchar), "updatedAt" = now()
      FROM telegram_bot AS bot
      WHERE groups."botId" = bot.id
        AND bot."tenantId" = groups."tenantId"
        AND bot."botType" = 'PAYMENT'
        AND $1::varchar = ANY(bot.capabilities)
        AND NOT ($1::varchar = ANY(groups.capabilities))
    `,
    [CAPABILITY],
  )
}

export class C2cPaidNotificationCapability1789025000000 implements MigrationInterface {
  readonly name = 'C2cPaidNotificationCapability1789025000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cPaidNotificationCapability(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('C2C paid notification capability migration is forward-only')
  }
}
