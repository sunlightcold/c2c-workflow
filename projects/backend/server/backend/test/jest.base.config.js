/** @type {import('jest').Config} */
module.exports = {
  rootDir: '..',
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@admin/(.*)$': '<rootDir>/apps/admin/$1',
  },
  setupFiles: ['<rootDir>/test/setup/timezone.setup.ts'],
  collectCoverageFrom: ['apps/**/*.ts', 'common/**/*.ts', '!**/*.d.ts'],
  coverageDirectory: '<rootDir>/coverage',
  testEnvironment: 'node',
}
