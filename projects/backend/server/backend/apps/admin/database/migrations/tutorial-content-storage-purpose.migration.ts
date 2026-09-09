import type { MigrationInterface, QueryRunner } from 'typeorm'

const AVATAR_PURPOSE = 'system.avatar'
const TUTORIAL_CONTENT_PURPOSE = 'system.tutorial-content'

export class TutorialContentStoragePurpose1785005000000 implements MigrationInterface {
  readonly name = 'TutorialContentStoragePurpose1785005000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO sys_storage_binding (
         "purposeCode", "channelId", "updatedBy", "createdAt", "updatedAt"
       )
       SELECT $1, "channelId", NULL, now(), now()
       FROM sys_storage_binding
       WHERE "purposeCode" = $2
       ON CONFLICT ("purposeCode") DO NOTHING`,
      [TUTORIAL_CONTENT_PURPOSE, AVATAR_PURPOSE],
    )

    const bindings = (await queryRunner.query(
      `SELECT "purposeCode"
       FROM sys_storage_binding
       WHERE "purposeCode" = ANY($1)`,
      [[AVATAR_PURPOSE, TUTORIAL_CONTENT_PURPOSE]],
    )) as Array<{ purposeCode: string }>
    const purposeCodes = new Set(bindings.map(({ purposeCode }) => purposeCode))
    if (purposeCodes.has(AVATAR_PURPOSE) && !purposeCodes.has(TUTORIAL_CONTENT_PURPOSE)) {
      throw new Error('Tutorial content storage purpose migration is incomplete')
    }
  }

  async down(): Promise<void> {
    throw new Error('Tutorial content storage purpose migration is forward-only')
  }
}
