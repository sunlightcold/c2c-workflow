import 'reflect-metadata'
import { assertRuntimeConfig } from '@/common/utils'
import { createMigrationDataSource } from './data-source'
import { executePendingMigrations } from './migration-runner'

async function main(): Promise<void> {
  assertRuntimeConfig()
  const dataSource = createMigrationDataSource()
  await dataSource.initialize()

  try {
    await executePendingMigrations(dataSource)
  } finally {
    await dataSource.destroy()
  }
}

main().catch((error: unknown) => {
  console.error('[migrate] failed')
  console.error(error)
  process.exitCode = 1
})
