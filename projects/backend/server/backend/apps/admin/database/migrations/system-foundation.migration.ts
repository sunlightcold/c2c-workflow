import type { EntityManager, MigrationInterface, QueryRunner } from 'typeorm'

const SYSTEM_TABLES = [
  'sys_access_token',
  'sys_log',
  'sys_menu',
  'sys_online_user',
  'sys_params',
  'sys_role',
  'sys_role_menu',
  'sys_static_file',
  'sys_task',
  'sys_task_log',
  'sys_user',
  'sys_user_file',
  'sys_user_role',
] as const

export async function migrateSystemFoundation(manager: EntityManager): Promise<void> {
  await manager.query('SELECT pg_advisory_xact_lock(1784000000)')
  await manager.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
  await manager.query(`
    DO $$ BEGIN CREATE TYPE actor_type_enum AS ENUM ('PLATFORM', 'TENANT');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_menu_show_enum AS ENUM ('1', '0');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_menu_source_enum AS ENUM ('system', 'custom');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_menu_type_enum AS ENUM ('MENU', 'FOLDER', 'PERMISSION', 'EMBED');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_online_user_status_enum AS ENUM ('online', 'offline');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_params_source_enum AS ENUM ('system', 'custom');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_task_log_tasksource_enum AS ENUM ('custom', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_task_source_enum AS ENUM ('custom', 'system');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_task_status_enum AS ENUM ('0', '1');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_task_type_enum AS ENUM ('Cron', 'Interval');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_user_file_access_enum AS ENUM ('private', 'public');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE sys_user_file_type_enum AS ENUM ('avatar', 'image', 'temp');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS sys_log (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      title varchar(20),
      content text,
      "serviceMethod" varchar NOT NULL,
      "httpMethod" varchar(10),
      ip varchar(50),
      url varchar(400),
      os varchar(50),
      browser varchar(50),
      city varchar(50),
      country varchar(50),
      region varchar(50),
      agent varchar(200),
      username varchar(100),
      params text,
      body text,
      query text
    );

    CREATE TABLE IF NOT EXISTS sys_menu (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "createBy" integer,
      "updateBy" integer,
      key varchar(120) UNIQUE,
      source sys_menu_source_enum NOT NULL DEFAULT 'custom',
      locked integer NOT NULL DEFAULT 0,
      "managedHash" varchar(64),
      "parentId" integer,
      name varchar(20) NOT NULL,
      path varchar(100),
      component varchar(100),
      permission varchar(100),
      type sys_menu_type_enum NOT NULL,
      icon varchar,
      "iframeSrc" varchar,
      status integer NOT NULL DEFAULT 1,
      "keepAlive" integer NOT NULL DEFAULT 1,
      show sys_menu_show_enum NOT NULL DEFAULT '1',
      "orderNo" integer NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sys_params (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "createBy" integer,
      "updateBy" integer,
      source sys_params_source_enum NOT NULL DEFAULT 'custom',
      locked integer NOT NULL DEFAULT 0,
      name varchar NOT NULL,
      key varchar NOT NULL UNIQUE,
      value varchar NOT NULL,
      type integer NOT NULL,
      description varchar(200)
    );

    CREATE TABLE IF NOT EXISTS sys_role (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "createBy" integer,
      "updateBy" integer,
      value varchar(20) NOT NULL UNIQUE,
      name varchar(20) NOT NULL,
      status integer NOT NULL DEFAULT 1,
      description varchar(100)
    );

    CREATE TABLE IF NOT EXISTS sys_static_file (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "createBy" integer,
      "updateBy" integer,
      name varchar NOT NULL,
      path varchar NOT NULL,
      ext varchar NOT NULL,
      size bigint NOT NULL,
      hash varchar NOT NULL,
      "refCount" integer NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sys_task (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createBy" integer,
      "updateBy" integer,
      source sys_task_source_enum NOT NULL DEFAULT 'custom',
      name varchar(20) NOT NULL,
      service varchar(100) NOT NULL,
      type sys_task_type_enum NOT NULL,
      status sys_task_status_enum NOT NULL,
      "startedAt" timestamptz,
      "endedAt" timestamptz,
      "limit" integer,
      cron varchar,
      every integer,
      data text,
      "jobOpts" text,
      description varchar(200)
    );

    CREATE TABLE IF NOT EXISTS sys_user (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "createBy" integer,
      "updateBy" integer,
      "actorType" actor_type_enum NOT NULL DEFAULT 'PLATFORM',
      "tenantId" uuid,
      "authzVersion" integer NOT NULL DEFAULT 1,
      salt varchar NOT NULL,
      username varchar(20) NOT NULL UNIQUE,
      email varchar UNIQUE,
      password varchar(40) NOT NULL,
      status integer NOT NULL DEFAULT 1,
      nickname varchar NOT NULL,
      avatar varchar,
      "otpSecret" varchar,
      "isOtpEnabled" boolean NOT NULL DEFAULT false,
      description varchar(100)
    );

    CREATE TABLE IF NOT EXISTS sys_role_menu (
      "roleId" integer NOT NULL REFERENCES sys_role(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "menuId" integer NOT NULL REFERENCES sys_menu(id) ON DELETE CASCADE,
      PRIMARY KEY ("roleId", "menuId")
    );
    CREATE INDEX IF NOT EXISTS idx_sys_role_menu_role ON sys_role_menu ("roleId");
    CREATE INDEX IF NOT EXISTS idx_sys_role_menu_menu ON sys_role_menu ("menuId");

    CREATE TABLE IF NOT EXISTS sys_user_role (
      "userId" integer NOT NULL REFERENCES sys_user(id) ON UPDATE CASCADE ON DELETE CASCADE,
      "roleId" integer NOT NULL REFERENCES sys_role(id),
      PRIMARY KEY ("userId", "roleId")
    );
    CREATE INDEX IF NOT EXISTS idx_sys_user_role_user ON sys_user_role ("userId");
    CREATE INDEX IF NOT EXISTS idx_sys_user_role_role ON sys_user_role ("roleId");

    CREATE TABLE IF NOT EXISTS sys_access_token (
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "expiredAt" timestamptz NOT NULL,
      value varchar NOT NULL,
      "userId" integer REFERENCES sys_user(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sys_access_token_expired_at ON sys_access_token ("expiredAt");

    CREATE TABLE IF NOT EXISTS sys_online_user (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      ip varchar(50) NOT NULL,
      os varchar(50),
      browser varchar(50),
      city varchar(50),
      country varchar(50),
      region varchar(50),
      agent varchar(200),
      "loginAt" timestamptz,
      "logoutAt" timestamptz,
      status sys_online_user_status_enum NOT NULL DEFAULT 'offline',
      "userId" integer REFERENCES sys_user(id) ON DELETE CASCADE,
      "tokenId" uuid REFERENCES sys_access_token(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sys_task_log (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      "taskSource" sys_task_log_tasksource_enum NOT NULL DEFAULT 'custom',
      status integer NOT NULL,
      detail text,
      "consumeTime" integer NOT NULL DEFAULT 0,
      "startedAt" timestamptz NOT NULL,
      "endedAt" timestamptz,
      "taskName" varchar NOT NULL,
      "taskId" uuid REFERENCES sys_task(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sys_user_file (
      "createdAt" timestamptz NOT NULL DEFAULT now(),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      id serial PRIMARY KEY,
      type sys_user_file_type_enum NOT NULL,
      access sys_user_file_access_enum NOT NULL,
      "userId" integer REFERENCES sys_user(id),
      "fileId" integer REFERENCES sys_static_file(id) ON DELETE CASCADE
    );
  `)

  const tenantTableExists = await manager.query<Array<{ exists: boolean }>>(
    `SELECT to_regclass(current_schema() || '.tenant') IS NOT NULL AS exists`,
  )
  if (tenantTableExists[0]?.exists) await ensureSystemUserTenantForeignKey(manager)
}

export async function ensureSystemUserTenantForeignKey(manager: EntityManager): Promise<void> {
  await manager.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_sys_user_tenant'
          AND conrelid = 'sys_user'::regclass
      ) THEN
        ALTER TABLE sys_user
          ADD CONSTRAINT fk_sys_user_tenant
          FOREIGN KEY ("tenantId") REFERENCES tenant(id) ON DELETE RESTRICT;
      END IF;
    END $$
  `)
}

export async function readSystemFoundationTables(manager: EntityManager): Promise<string[]> {
  const tables = await manager.query<Array<{ table_name: string }>>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1)
     ORDER BY table_name`,
    [[...SYSTEM_TABLES]],
  )
  return tables.map(({ table_name }) => table_name)
}

export class SystemFoundation1784000000000 implements MigrationInterface {
  readonly name = 'SystemFoundation1784000000000'

  async up(queryRunner: QueryRunner): Promise<void> {
    await migrateSystemFoundation(queryRunner.manager)
    const tables = await readSystemFoundationTables(queryRunner.manager)
    if (tables.join(',') !== SYSTEM_TABLES.join(',')) {
      throw new Error(`System foundation migration is incomplete: ${JSON.stringify(tables)}`)
    }
  }

  async down(): Promise<void> {
    throw new Error('System foundation migration is forward-only')
  }
}
