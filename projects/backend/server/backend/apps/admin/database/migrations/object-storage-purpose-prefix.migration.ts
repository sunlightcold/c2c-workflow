import type { MigrationInterface, QueryRunner } from 'typeorm'

export class ObjectStoragePurposePrefix1785002000000 implements MigrationInterface {
  readonly name = 'ObjectStoragePurposePrefix1785002000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sys_storage_binding
      ADD COLUMN IF NOT EXISTS "keyPrefixOverride" varchar(128)
    `)
    const columns = (await queryRunner.query(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'sys_storage_binding'
         AND column_name = 'keyPrefixOverride'`,
    )) as Array<{ column_name: string }>
    if (columns[0]?.column_name !== 'keyPrefixOverride') {
      throw new Error('Object storage purpose prefix migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('Object storage purpose prefix migration is forward-only')
  }
}
