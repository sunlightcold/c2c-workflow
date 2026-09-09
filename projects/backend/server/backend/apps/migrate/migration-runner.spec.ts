import type { DataSource, QueryRunner } from 'typeorm'
import { executePendingMigrations } from './migration-runner'

describe('migration runner', () => {
  it('runs pending migrations while holding the deployment lock', async () => {
    const query = jest.fn().mockResolvedValue(undefined)
    const release = jest.fn().mockResolvedValue(undefined)
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query,
      release,
    } as unknown as QueryRunner
    const runMigrations = jest.fn().mockResolvedValue([])
    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      runMigrations,
    } as unknown as DataSource

    await executePendingMigrations(dataSource)

    expect(query).toHaveBeenNthCalledWith(1, 'SELECT pg_advisory_lock($1)', [912_407_200])
    expect(runMigrations).toHaveBeenCalledWith()
    expect(query).toHaveBeenNthCalledWith(2, 'SELECT pg_advisory_unlock($1)', [912_407_200])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases the deployment lock when a migration fails', async () => {
    const migrationError = new Error('migration failed')
    const query = jest.fn().mockResolvedValue(undefined)
    const release = jest.fn().mockResolvedValue(undefined)
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query,
      release,
    } as unknown as QueryRunner
    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      runMigrations: jest.fn().mockRejectedValue(migrationError),
    } as unknown as DataSource

    await expect(executePendingMigrations(dataSource)).rejects.toBe(migrationError)

    expect(query).toHaveBeenLastCalledWith('SELECT pg_advisory_unlock($1)', [912_407_200])
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('releases the query runner when the deployment lock cannot be acquired', async () => {
    const lockError = new Error('lock failed')
    const release = jest.fn().mockResolvedValue(undefined)
    const queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockRejectedValue(lockError),
      release,
    } as unknown as QueryRunner
    const runMigrations = jest.fn()
    const dataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
      runMigrations,
    } as unknown as DataSource

    await expect(executePendingMigrations(dataSource)).rejects.toBe(lockError)

    expect(runMigrations).not.toHaveBeenCalled()
    expect(release).toHaveBeenCalledTimes(1)
  })
})
