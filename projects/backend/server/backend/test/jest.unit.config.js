const base = require('./jest.base.config')

const configuredMaxWorkers = Number(process.env.JEST_MAX_WORKERS)
const maxWorkers = Number.isFinite(configuredMaxWorkers) && configuredMaxWorkers > 0
  ? configuredMaxWorkers
  : 1

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  displayName: 'unit',
  maxWorkers,
  testMatch: ['<rootDir>/apps/**/*.spec.ts', '<rootDir>/common/**/*.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '<rootDir>/test/integration/', '<rootDir>/test/e2e/'],
}
