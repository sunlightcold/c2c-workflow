import config from 'config'
import { Client } from 'pg'

type CliOptions = {
  backupSuffix: string
  execute: boolean
  schema: string
  tableLike?: string
}

type TimestampColumn = {
  columnName: string
  isNullable: string
  tableName: string
  tableSchema: string
}

type TablePlan = {
  backupTableName: string
  columns: TimestampColumn[]
  tableName: string
  tableSchema: string
}

const TIMESTAMPTZ_MIGRATION_BACKUP_MARKER = '__tstz_bak_'
const EXCLUDED_BACKUP_TABLE_PATTERNS = [
  `%${TIMESTAMPTZ_MIGRATION_BACKUP_MARKER}%`,
  '%__tzfix_bak_%',
  '%\\_backup\\_%',
]

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

function timestampNowTag(): string {
  const now = new Date()
  const pad = (num: number) => String(num).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}

function shortTableFingerprint(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36).slice(-6).padStart(6, '0')
}

function toBackupTableName(tableName: string, suffix: string): string {
  const fingerprint = shortTableFingerprint(tableName)
  const reserved = `${TIMESTAMPTZ_MIGRATION_BACKUP_MARKER}${suffix}_${fingerprint}`
  const base = `${tableName}${reserved}`
  if (base.length <= 63) return base

  const keep = Math.max(1, 63 - reserved.length)
  return `${tableName.slice(0, keep)}${reserved}`
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    backupSuffix: timestampNowTag(),
    execute: false,
    schema: 'public',
  }

  for (const arg of argv) {
    if (arg === '--execute') {
      opts.execute = true
      continue
    }
    if (arg === '--dry-run') {
      opts.execute = false
      continue
    }
    if (arg.startsWith('--backup-suffix=')) {
      opts.backupSuffix = arg.slice('--backup-suffix='.length)
      continue
    }
    if (arg.startsWith('--schema=')) {
      opts.schema = arg.slice('--schema='.length)
      continue
    }
    if (arg.startsWith('--table-like=')) {
      opts.tableLike = arg.slice('--table-like='.length)
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
  }

  if (!/^[A-Za-z0-9_]+$/.test(opts.backupSuffix) || opts.backupSuffix.length > 32) {
    throw new Error('--backup-suffix must be 1-32 characters: letters, numbers or underscore')
  }

  return opts
}

function printUsage() {
  console.log(`
Usage:
  pnpm --dir server/backend exec ts-node -r tsconfig-paths/register scripts/migrate-timestamps-to-timestamptz.ts [options]

Default behavior:
  - dry-run only
  - scans public timestamp without time zone columns
  - converts historical values as UTC wall-clock timestamps

Options:
  --execute                         Apply migration
  --dry-run                         Preview only
  --schema=public                   Target schema
  --table-like=app_%                Optional LIKE filter on table name
  --backup-suffix=manual_tag        Backup table suffix
  --help
`)
}

async function loadTimestampColumns(client: Client, opts: CliOptions): Promise<TimestampColumn[]> {
  const params = [opts.schema, ...EXCLUDED_BACKUP_TABLE_PATTERNS]
  const conditions = [
    'c.table_schema = $1',
    "t.table_type = 'BASE TABLE'",
    "c.data_type = 'timestamp without time zone'",
  ]

  EXCLUDED_BACKUP_TABLE_PATTERNS.forEach((_, index) => {
    conditions.push(`c.table_name NOT LIKE $${index + 2}`)
  })

  if (opts.tableLike) {
    params.push(opts.tableLike)
    conditions.push(`c.table_name LIKE $${params.length}`)
  }

  const result = await client.query<TimestampColumn>(
    `
      SELECT
        c.table_schema AS "tableSchema",
        c.table_name AS "tableName",
        c.column_name AS "columnName",
        c.is_nullable AS "isNullable"
      FROM information_schema.columns c
      INNER JOIN information_schema.tables t
        ON t.table_schema = c.table_schema
       AND t.table_name = c.table_name
      WHERE ${conditions.join('\n        AND ')}
      ORDER BY c.table_name, c.ordinal_position
    `,
    params,
  )
  return result.rows
}

function buildTablePlans(columns: TimestampColumn[], backupSuffix: string): TablePlan[] {
  const grouped = new Map<string, TimestampColumn[]>()

  for (const column of columns) {
    const key = `${column.tableSchema}.${column.tableName}`
    const current = grouped.get(key) ?? []
    current.push(column)
    grouped.set(key, current)
  }

  return Array.from(grouped.entries()).map(([key, tableColumns]) => {
    const [tableSchema, tableName] = key.split('.')
    return {
      backupTableName: toBackupTableName(tableName, backupSuffix),
      columns: tableColumns,
      tableName,
      tableSchema,
    }
  })
}

async function ensureBackupTableNotExists(
  client: Client,
  schema: string,
  backupTableName: string,
): Promise<void> {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1
          AND table_name = $2
      ) AS exists
    `,
    [schema, backupTableName],
  )

  if (result.rows[0]?.exists) {
    throw new Error(`Backup table already exists: ${schema}.${backupTableName}`)
  }
}

async function executeMigration(client: Client, plans: TablePlan[]): Promise<void> {
  await client.query('BEGIN')
  try {
    for (const plan of plans) {
      const tableRef = `${quoteIdent(plan.tableSchema)}.${quoteIdent(plan.tableName)}`
      const backupRef = `${quoteIdent(plan.tableSchema)}.${quoteIdent(plan.backupTableName)}`
      await ensureBackupTableNotExists(client, plan.tableSchema, plan.backupTableName)
      await client.query(`CREATE TABLE ${backupRef} AS TABLE ${tableRef}`)

      for (const column of plan.columns) {
        const columnIdent = quoteIdent(column.columnName)
        await client.query(`
          ALTER TABLE ${tableRef}
          ALTER COLUMN ${columnIdent} TYPE timestamptz
          USING ${columnIdent} AT TIME ZONE 'UTC'
        `)
      }

      console.log(
        `[execute] migrated table=${plan.tableSchema}.${plan.tableName}, columns=${plan.columns
          .map((column) => column.columnName)
          .join(',')}, backup=${plan.tableSchema}.${plan.backupTableName}`,
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const adminConfig = config.get<{
    postgres: {
      database: string
      host: string
      password: string
      port: number
      username: string
    }
  }>('admin')

  const client = new Client({
    database: adminConfig.postgres.database,
    host: adminConfig.postgres.host,
    password: adminConfig.postgres.password,
    port: adminConfig.postgres.port,
    user: adminConfig.postgres.username,
  })

  await client.connect()
  try {
    const columns = await loadTimestampColumns(client, opts)
    const plans = buildTablePlans(columns, opts.backupSuffix)

    console.log(
      JSON.stringify(
        {
          affectedColumnsTotal: columns.length,
          affectedTables: plans.length,
          mode: opts.execute ? 'execute' : 'dry-run',
          plans: plans.map((plan) => ({
            backupTable: `${plan.tableSchema}.${plan.backupTableName}`,
            columns: plan.columns.map((column) => ({
              column: column.columnName,
              nullable: column.isNullable === 'YES',
            })),
            table: `${plan.tableSchema}.${plan.tableName}`,
          })),
          schema: opts.schema,
          tableLike: opts.tableLike ?? null,
        },
        null,
        2,
      ),
    )

    if (!opts.execute) {
      console.log('[dry-run] no data changed. Use --execute to apply migration.')
      return
    }

    await executeMigration(client, plans)
    console.log('[execute] completed successfully.')
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  console.error(`[migrate-timestamps-to-timestamptz] failed: ${message}`)
  process.exit(1)
})
