import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const MIGRATION_LOCK_ID = 912_407_145
const TABLES = ['sys_storage_binding', 'sys_storage_channel'] as const
const ENUM_DEFINITIONS = [
  ['sys_storage_channel_provider_enum', ['s3_compatible']],
  ['sys_storage_channel_status_enum', ['active', 'disabled', 'error']],
] as const
const REQUIRED_INDEXES = ['idx_sys_storage_binding_channel', 'uq_sys_storage_channel_code'] as const

export interface ObjectStorageCenterSchemaState {
  enumValues: Record<string, string[]>
  indexes: string[]
  tables: string[]
}

export async function readObjectStorageCenterSchemaState(
  manager: EntityManager,
): Promise<ObjectStorageCenterSchemaState> {
  const [tables, indexes, enumRows] = await Promise.all([
    manager.query<Array<{ table_name: string }>>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_name = ANY($1)
       ORDER BY table_name`,
      [[...TABLES]],
    ),
    manager.query<Array<{ indexname: string }>>(
      `SELECT indexname
       FROM pg_indexes
       WHERE schemaname = current_schema() AND indexname = ANY($1)
       ORDER BY indexname`,
      [[...REQUIRED_INDEXES]],
    ),
    manager.query<Array<{ name: string; value: string }>>(
      `SELECT type.typname AS name, enum.enumlabel AS value
       FROM pg_type type
       JOIN pg_enum enum ON enum.enumtypid = type.oid
       JOIN pg_namespace namespace ON namespace.oid = type.typnamespace
       WHERE namespace.nspname = current_schema() AND type.typname = ANY($1)
       ORDER BY type.typname, enum.enumsortorder`,
      [ENUM_DEFINITIONS.map(([name]) => name)],
    ),
  ])
  const enumValues: Record<string, string[]> = {}
  for (const row of enumRows) (enumValues[row.name] ??= []).push(row.value)
  return {
    enumValues,
    indexes: indexes.map(({ indexname }) => indexname),
    tables: tables.map(({ table_name }) => table_name),
  }
}

export function assertObjectStorageCenterMigrated(state: ObjectStorageCenterSchemaState): void {
  const enumsReady = ENUM_DEFINITIONS.every(
    ([name, values]) => state.enumValues[name]?.join(',') === values.join(','),
  )
  if (
    state.tables.join(',') !== TABLES.join(',') ||
    state.indexes.join(',') !== REQUIRED_INDEXES.join(',') ||
    !enumsReady
  ) {
    throw new Error(`Object storage center migration is incomplete: ${JSON.stringify(state)}`)
  }
}

export async function migrateObjectStorageCenter(manager: EntityManager): Promise<void> {
  await manager.query(`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK_ID})`)
  await manager.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`)
  for (const [name, values] of ENUM_DEFINITIONS) {
    const literals = values.map((value) => `'${value}'`).join(', ')
    await manager.query(
      `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${literals}); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
    )
  }
  await manager.query(`
    CREATE TABLE IF NOT EXISTS sys_storage_channel (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      code varchar(64) NOT NULL,
      name varchar(100) NOT NULL,
      provider sys_storage_channel_provider_enum NOT NULL,
      endpoint varchar(512) NOT NULL,
      region varchar(64) NOT NULL DEFAULT 'auto',
      bucket varchar(128) NOT NULL,
      "publicBaseUrl" varchar(512),
      "forcePathStyle" boolean NOT NULL DEFAULT true,
      "accessKeyId" varchar(255) NOT NULL,
      "encryptedSecretAccessKey" text NOT NULL,
      "credentialVersion" integer NOT NULL DEFAULT 1,
      status sys_storage_channel_status_enum NOT NULL DEFAULT 'disabled',
      "lastCheckedAt" timestamptz,
      "lastCheckMessage" varchar(512)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_sys_storage_channel_code
      ON sys_storage_channel (code);

    CREATE TABLE IF NOT EXISTS sys_storage_binding (
      "purposeCode" varchar(100) PRIMARY KEY,
      "channelId" uuid NOT NULL REFERENCES sys_storage_channel(id) ON DELETE RESTRICT,
      "updatedBy" integer,
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_sys_storage_binding_channel
      ON sys_storage_binding ("channelId");
  `)
}

export class ObjectStorageCenter1785001000000 implements MigrationInterface {
  readonly name = 'ObjectStorageCenter1785001000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateObjectStorageCenter(queryRunner.manager)
    assertObjectStorageCenterMigrated(await readObjectStorageCenterSchemaState(queryRunner.manager))
  }

  async down(): Promise<void> {
    throw new Error('Object storage center migration is forward-only')
  }
}
