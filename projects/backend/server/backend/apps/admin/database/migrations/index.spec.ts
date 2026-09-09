import { adminMigrations } from './index'

describe('admin migration registry', () => {
  it('registers deployment migrations in version order', () => {
    expect(adminMigrations.map((Migration) => new Migration().name)).toEqual([
      'TutorialCenter1785000000000',
      'ObjectStorageCenter1785001000000',
      'ObjectStoragePurposePrefix1785002000000',
      'TutorialContentStoragePurpose1785005000000',
      'AiGateway1785005500000',
      'AiGatewayChannelCapacity1785005600000',
      'ClientErrorEvents1785008000000',
      'AiCallLogs1787001000000',
      'C2cBusinessFoundation1789000000000',
    ])
  })
})
