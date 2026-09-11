describe('migration data source', () => {
  it('loads the registered admin migrations without importing the admin module graph', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    try {
      const { createMigrationDataSource } = await import('./data-source')
      const dataSource = createMigrationDataSource()
      const migrations = dataSource.options.migrations as Array<new () => { name: string }>

      expect(migrations.map((Migration) => new Migration().name)).toEqual([
        'SystemFoundation1784000000000',
        'TutorialCenter1785000000000',
        'ObjectStorageCenter1785001000000',
        'ObjectStoragePurposePrefix1785002000000',
        'TutorialContentStoragePurpose1785005000000',
        'AiGateway1785005500000',
        'AiGatewayChannelCapacity1785005600000',
        'ClientErrorEvents1785008000000',
        'AiCallLogs1787001000000',
        'C2cBusinessFoundation1789000000000',
        'C2cPaymentOrders1789001000000',
        'C2cPaymentRouting1789002000000',
        'C2cMerchantPlatformCredentials1789003000000',
        'C2cMerchantOrders1789004000000',
        'C2cPaymentBatches1789005000000',
        'C2cMerchantAccountOperations1789006000000',
        'C2cMerchantOrderAppeals1789007000000',
        'C2cTelegramAdministration1789008000000',
        'C2cTelegramUpdateInbox1789009000000',
        'C2cTelegramInteractions1789010000000',
      ])
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = originalNodeEnv
    }
  })
})
