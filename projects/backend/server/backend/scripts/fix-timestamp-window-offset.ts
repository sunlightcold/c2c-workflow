import config from 'config'
import { Client } from 'pg'

type CliOptions = {
  execute: boolean
  schema: string
  start: string
  end: string
  offsetHours: number
  backupSuffix: string
  tableLike?: string
}

type TimestampColumn = {
  tableSchema: string
  tableName: string
  columnName: string
}

type TablePlan = {
  tableSchema: string
  tableName: string
  columns: string[]
  anchorColumn: string
  affectedByColumn: Array<{ column: string; count: number }>
  affectedRows: number
}

const DEFAULT_START = '2026-04-27 04:00:00'
const DEFAULT_END = '2026-04-29 01:31:00'
const DEFAULT_OFFSET_HOURS = 8

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
  const base = `${tableName}__tzfix_bak_${suffix}_${fingerprint}`
  if (base.length <= 63) return base
  const reserved = `__tzfix_bak_${suffix}_${fingerprint}`
  const keep = Math.max(1, 63 - reserved.length)
  return `${tableName.slice(0, keep)}${reserved}`
}

function parseArgs(argv: string[]): CliOptions {
  const defaults: CliOptions = {
    execute: false,
    schema: 'public',
    start: DEFAULT_START,
    end: DEFAULT_END,
    offsetHours: DEFAULT_OFFSET_HOURS,
    backupSuffix: timestampNowTag(),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--execute') {
      defaults.execute = true
      continue
    }
    if (arg === '--dry-run') {
      defaults.execute = false
      continue
    }
    if (arg.startsWith('--schema=')) {
      defaults.schema = arg.slice('--schema='.length)
      continue
    }
    if (arg.startsWith('--start=')) {
      defaults.start = arg.slice('--start='.length)
      continue
    }
    if (arg.startsWith('--end=')) {
      defaults.end = arg.slice('--end='.length)
      continue
    }
    if (arg.startsWith('--offset-hours=')) {
      defaults.offsetHours = Number(arg.slice('--offset-hours='.length))
      continue
    }
    if (arg.startsWith('--backup-suffix=')) {
      defaults.backupSuffix = arg.slice('--backup-suffix='.length)
      continue
    }
    if (arg.startsWith('--table-like=')) {
      defaults.tableLike = arg.slice('--table-like='.length)
      continue
    }
    if (arg === '--help' || arg === '-h') {
      printUsage()
      process.exit(0)
    }
  }

  if (!Number.isFinite(defaults.offsetHours) || defaults.offsetHours <= 0) {
    throw new Error(`Invalid --offset-hours: ${defaults.offsetHours}`)
  }

  return defaults
}

function printUsage() {
  console.log(`
Usage:
  pnpm --dir server/backend exec ts-node -r tsconfig-paths/register scripts/fix-timestamp-window-offset.ts [options]

Default behavior:
  - dry-run only (no data changes)
  - window: ${DEFAULT_START} ~ ${DEFAULT_END} (Asia/Shanghai local wall time)
  - fix action: subtract ${DEFAULT_OFFSET_HOURS} hours

Options:
  --execute                    Apply updates (default is dry-run)
  --dry-run                    Preview only
  --schema=public              Target schema (default: public)
  --start="YYYY-MM-DD HH:mm:ss"
  --end="YYYY-MM-DD HH:mm:ss"
  --offset-hours=8
  --backup-suffix=manual_tag
  --table-like=app_%           Optional LIKE filter on table name
  --help
`)
}

async function loadTimestampColumns(client: Client, opts: CliOptions): Promise<TimestampColumn[]> {
  const likeClause = opts.tableLike ? 'AND c.table_name LIKE $2' : ''
  const params = opts.tableLike ? [opts.schema, opts.tableLike] : [opts.schema]
  const sql = `
    SELECT
      c.table_schema AS "tableSchema",
      c.table_name AS "tableName",
      c.column_name AS "columnName"
    FROM information_schema.columns c
    INNER JOIN information_schema.tables t
      ON t.table_schema = c.table_schema
     AND t.table_name = c.table_name
    WHERE c.table_schema = $1
      AND t.table_type = 'BASE TABLE'
      AND c.data_type = 'timestamp without time zone'
      AND c.table_name NOT LIKE '%__tzfix_bak_%'
      ${likeClause}
    ORDER BY c.table_name, c.ordinal_position
  `
  const result = await client.query<TimestampColumn>(sql, params)
  return result.rows
}

async function buildTablePlans(
  client: Client,
  columns: TimestampColumn[],
  opts: CliOptions,
): Promise<TablePlan[]> {
  const grouped = new Map<string, TablePlan>()

  for (const col of columns) {
    const key = `${col.tableSchema}.${col.tableName}`
    const existing = grouped.get(key)
    if (existing) {
      existing.columns.push(col.columnName)
      continue
    }
    grouped.set(key, {
      tableSchema: col.tableSchema,
      tableName: col.tableName,
      columns: [col.columnName],
      anchorColumn: 'createdAt',
      affectedByColumn: [],
      affectedRows: 0,
    })
  }

  const plans = [...grouped.values()].filter((plan) => plan.columns.includes(plan.anchorColumn))

  for (const plan of plans) {
    const tableRef = `${quoteIdent(plan.tableSchema)}.${quoteIdent(plan.tableName)}`
    const anchorIdent = quoteIdent(plan.anchorColumn)
    const anchorWhere = `${anchorIdent} BETWEEN $1::timestamp AND $2::timestamp`

    for (const column of plan.columns) {
      const c = quoteIdent(column)
      const countSql = `
        SELECT COUNT(*)::bigint AS count
        FROM ${tableRef}
        WHERE ${anchorWhere}
          AND ${c} BETWEEN $1::timestamp AND $2::timestamp
      `
      const countRs = await client.query<{ count: string }>(countSql, [opts.start, opts.end])
      plan.affectedByColumn.push({
        column,
        count: Number(countRs.rows[0]?.count ?? 0),
      })
    }

    const totalSql = `SELECT COUNT(*)::bigint AS count FROM ${tableRef} WHERE ${anchorWhere}`
    const totalRs = await client.query<{ count: string }>(totalSql, [opts.start, opts.end])
    plan.affectedRows = Number(totalRs.rows[0]?.count ?? 0)
  }

  return plans.filter((plan) => plan.affectedRows > 0)
}

async function ensureBackupTableNotExists(
  client: Client,
  schema: string,
  backupTableName: string,
): Promise<void> {
  const rs = await client.query<{ exists: boolean }>(
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
  if (rs.rows[0]?.exists) {
    throw new Error(
      `Backup table already exists: ${schema}.${backupTableName}. Use --backup-suffix=... and retry.`,
    )
  }
}

async function executeFix(client: Client, plans: TablePlan[], opts: CliOptions): Promise<void> {
  await client.query('BEGIN')
  try {
    for (const plan of plans) {
      const tableRef = `${quoteIdent(plan.tableSchema)}.${quoteIdent(plan.tableName)}`
      const backupTableName = toBackupTableName(plan.tableName, opts.backupSuffix)
      await ensureBackupTableNotExists(client, plan.tableSchema, backupTableName)
      const backupRef = `${quoteIdent(plan.tableSchema)}.${quoteIdent(backupTableName)}`
      const anchorWhere = `${quoteIdent(plan.anchorColumn)} BETWEEN $1::timestamp AND $2::timestamp`

      const createBackupSql = `
        CREATE TABLE ${backupRef} AS
        SELECT *
        FROM ${tableRef}
        WHERE ${anchorWhere}
      `
      await client.query(createBackupSql, [opts.start, opts.end])

      const setClause = plan.columns
        .map((column) => {
          const c = quoteIdent(column)
          return `${c} = CASE
            WHEN ${c} BETWEEN $1::timestamp AND $2::timestamp
            THEN ${c} - ($3::int * INTERVAL '1 hour')
            ELSE ${c}
          END`
        })
        .join(',\n')

      const updateSql = `
        UPDATE ${tableRef}
        SET
          ${setClause}
        WHERE ${anchorWhere}
      `

      await client.query(updateSql, [opts.start, opts.end, opts.offsetHours])
      console.log(
        `[execute] updated table=${plan.tableSchema}.${plan.tableName}, anchor=${plan.anchorColumn}, backup=${plan.tableSchema}.${backupTableName}, rows=${plan.affectedRows}`,
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

async function loadSkippedTablesWithoutCreatedAt(
  columns: TimestampColumn[],
  plans: TablePlan[],
): Promise<string[]> {
  const allTables = new Set(columns.map((c) => `${c.tableSchema}.${c.tableName}`))
  const included = new Set(plans.map((p) => `${p.tableSchema}.${p.tableName}`))
  const skipped: string[] = []
  for (const table of allTables) {
    if (!included.has(table)) skipped.push(table)
  }
  return skipped.sort()
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const adminConfig = config.get<{
    postgres: {
      host: string
      port: number
      username: string
      password: string
      database: string
    }
  }>('admin')

  const client = new Client({
    host: adminConfig.postgres.host,
    port: adminConfig.postgres.port,
    user: adminConfig.postgres.username,
    password: adminConfig.postgres.password,
    database: adminConfig.postgres.database,
  })

  await client.connect()
  try {
    const columns = await loadTimestampColumns(client, opts)
    if (columns.length === 0) {
      console.log('[info] no timestamp without time zone columns found.')
      return
    }

    const plans = await buildTablePlans(client, columns, opts)
    const skippedTables = await loadSkippedTablesWithoutCreatedAt(columns, plans)
    const totalRows = plans.reduce((sum, item) => sum + item.affectedRows, 0)

    console.log(
      JSON.stringify(
        {
          mode: opts.execute ? 'execute' : 'dry-run',
          window: {
            start: opts.start,
            end: opts.end,
          },
          offsetHours: opts.offsetHours,
          schema: opts.schema,
          tableLike: opts.tableLike ?? null,
          selectionRule: `only rows with createdAt BETWEEN [start, end]`,
          affectedTables: plans.length,
          affectedRowsTotal: totalRows,
          skippedTablesWithoutCreatedAt: skippedTables,
          plans: plans.map((p) => ({
            table: `${p.tableSchema}.${p.tableName}`,
            anchorColumn: p.anchorColumn,
            affectedRows: p.affectedRows,
            affectedByColumn: p.affectedByColumn,
            backupTable: `${p.tableSchema}.${toBackupTableName(p.tableName, opts.backupSuffix)}`,
          })),
        },
        null,
        2,
      ),
    )

    if (!opts.execute) {
      console.log('[dry-run] no data changed. Use --execute to apply updates.')
      return
    }

    await executeFix(client, plans, opts)
    console.log('[execute] completed successfully.')
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  console.error(`[fix-timestamp-window-offset] failed: ${message}`)
  process.exit(1)
})
