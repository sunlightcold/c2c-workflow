import type { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Removes the optional AI gateway and client error stores now that those
 * capabilities are no longer part of the product surface.
 *
 * The operation is idempotent so it is safe for installations that never ran
 * the historical feature migrations as well as installations that did.
 */
export class RemoveAiAndClientError1789014000000 implements MigrationInterface {
  readonly name = 'RemoveAiAndClientError1789014000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS sys_ai_feature_route CASCADE;
      DROP TABLE IF EXISTS sys_ai_call_log CASCADE;
      DROP TABLE IF EXISTS sys_ai_model CASCADE;
      DROP TABLE IF EXISTS sys_ai_channel CASCADE;
      DROP TABLE IF EXISTS sys_client_error_event CASCADE;
    `)
  }

  async down(): Promise<void> {
    throw new Error('AI and client error removal migration is forward-only')
  }
}
