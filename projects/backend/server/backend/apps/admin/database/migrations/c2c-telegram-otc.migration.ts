import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const CAPABILITY = 'OTC_CONFIG_MANAGE'

export async function migrateC2cTelegramOtc(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1789028000)')
  await manager.query(`
    CREATE TABLE IF NOT EXISTS telegram_otc_config (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "tenantId" uuid NOT NULL REFERENCES tenant(id) ON DELETE RESTRICT,
      "botId" uuid NOT NULL REFERENCES telegram_bot(id) ON DELETE CASCADE,
      "chatId" varchar(32) NOT NULL,
      "rateSource" varchar(16) NOT NULL DEFAULT 'OKX_BLOCK',
      "paymentMethod" varchar(16) NOT NULL DEFAULT 'ALL',
      "priceRank" smallint NOT NULL DEFAULT 3,
      "rateAdjustment" decimal(20, 8) NOT NULL DEFAULT 0,
      CONSTRAINT ck_telegram_otc_config_source
        CHECK ("rateSource" IN ('BINANCE', 'OKX', 'OKX_BLOCK')),
      CONSTRAINT ck_telegram_otc_config_payment
        CHECK ("paymentMethod" IN ('ALL', 'ALIPAY', 'BANK', 'WECHAT')),
      CONSTRAINT ck_telegram_otc_config_rank CHECK ("priceRank" BETWEEN 1 AND 10)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_otc_config_scope
      ON telegram_otc_config ("tenantId", "botId", "chatId");
    CREATE INDEX IF NOT EXISTS idx_telegram_otc_config_tenant
      ON telegram_otc_config ("tenantId");
  `)
  await manager.query(
    `UPDATE telegram_bot
     SET capabilities = array_append(capabilities, $1::varchar), "updatedAt" = now()
     WHERE "botType" = 'PAYMENT' AND NOT ($1::varchar = ANY(capabilities))`,
    [CAPABILITY],
  )
  await manager.query(
    `UPDATE telegram_group AS groups
     SET capabilities = array_append(groups.capabilities, $1::varchar), "updatedAt" = now()
     FROM telegram_bot AS bot
     WHERE groups."botId" = bot.id
       AND groups."tenantId" = bot."tenantId"
       AND bot."botType" = 'PAYMENT'
       AND $1::varchar = ANY(bot.capabilities)
       AND NOT ($1::varchar = ANY(groups.capabilities))`,
    [CAPABILITY],
  )
  await manager.query(
    `UPDATE telegram_group_member AS members
     SET capabilities = array_append(members.capabilities, $1::varchar), "updatedAt" = now()
     FROM telegram_group AS groups
     WHERE members."groupId" = groups.id
       AND members."tenantId" = groups."tenantId"
       AND members.role = 'ADMIN'
       AND $1::varchar = ANY(groups.capabilities)
       AND NOT ($1::varchar = ANY(members.capabilities))`,
    [CAPABILITY],
  )
}

export class C2cTelegramOtc1789028000000 implements MigrationInterface {
  readonly name = 'C2cTelegramOtc1789028000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateC2cTelegramOtc(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('C2C Telegram OTC migration is forward-only')
  }
}
