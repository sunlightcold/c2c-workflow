import type { DataSource } from 'typeorm'

const DEPLOYMENT_MIGRATION_LOCK_ID = 912_407_200

export async function executePendingMigrations(dataSource: DataSource): Promise<void> {
  const lockRunner = dataSource.createQueryRunner()
  await lockRunner.connect()

  try {
    await lockRunner.query('SELECT pg_advisory_lock($1)', [DEPLOYMENT_MIGRATION_LOCK_ID])
    try {
      await dataSource.runMigrations()
    } finally {
      await lockRunner.query('SELECT pg_advisory_unlock($1)', [DEPLOYMENT_MIGRATION_LOCK_ID])
    }
  } finally {
    await lockRunner.release()
  }
}
