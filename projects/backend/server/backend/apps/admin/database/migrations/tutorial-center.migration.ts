import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const TABLE = 'sys_tutorial'
const INDEX = 'uq_sys_tutorial_locale_slug'
const LOCALE_ENUM = 'sys_tutorial_locale_enum'

export async function migrateTutorialCenter(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(804216734)')
  await manager.query(`
    DO $$ BEGIN
      CREATE TYPE "${LOCALE_ENUM}" AS ENUM ('zh', 'en', 'ja', 'zh-Hant');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$
  `)
  await manager.query(`
    CREATE TABLE IF NOT EXISTS "${TABLE}" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      "createBy" integer,
      "updateBy" integer,
      "locale" "${LOCALE_ENUM}" NOT NULL,
      "slug" varchar(160) NOT NULL,
      "draft" jsonb NOT NULL,
      "published" jsonb,
      "publishedAt" timestamptz
    )
  `)
  await manager.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${INDEX}" ON "${TABLE}" ("locale", "slug")`,
  )
  const [{ count }] = await manager.query<Array<{ count: string }>>(
    `SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1`,
    [TABLE],
  )
  if (Number(count) !== 1) throw new Error(`Tutorial table is incomplete: ${TABLE}`)
}

export class TutorialCenter1785000000000 implements MigrationInterface {
  readonly name = 'TutorialCenter1785000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateTutorialCenter(queryRunner.manager)
  }

  async down(): Promise<void> {
    throw new Error('Tutorial center migration is forward-only')
  }
}
