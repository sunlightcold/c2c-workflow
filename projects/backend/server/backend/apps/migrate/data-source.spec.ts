describe('migration data source', () => {
  it('loads the registered admin migrations without importing the admin module graph', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const { createMigrationDataSource } = await import('./data-source')
      const dataSource = createMigrationDataSource()
      const migrations = dataSource.options.migrations as Array<new () => { name: string }>

      expect(migrations.map((Migration) => new Migration().name)).toEqual([
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
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }
  })
})
