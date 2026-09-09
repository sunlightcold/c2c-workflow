import { DataSource } from 'typeorm'
import { getAdminPostgresOptions } from '@/apps/admin/database/admin-postgres-options'
import { adminMigrations } from '@/apps/admin/database/migrations'

export function createMigrationDataSource(): DataSource {
  return new DataSource({
    ...getAdminPostgresOptions(),
    synchronize: false,
    migrations: adminMigrations,
    migrationsTableName: 'schema_migrations',
    migrationsTransactionMode: 'each',
  })
}
