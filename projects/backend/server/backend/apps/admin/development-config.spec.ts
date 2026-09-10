describe('development super administrator defaults', () => {
  const originalName = process.env.C2C_SUPER_ADMIN_NAME
  const originalPassword = process.env.C2C_SUPER_ADMIN_PASSWORD

  afterEach(() => {
    if (originalName === undefined) delete process.env.C2C_SUPER_ADMIN_NAME
    else process.env.C2C_SUPER_ADMIN_NAME = originalName
    if (originalPassword === undefined) delete process.env.C2C_SUPER_ADMIN_PASSWORD
    else process.env.C2C_SUPER_ADMIN_PASSWORD = originalPassword
    jest.resetModules()
  })

  async function loadDevelopmentConfig() {
    jest.resetModules()
    return (await import('../../config/development')).default as {
      common: { superAdminName: string; superAdminPassword: string }
    }
  }

  it('uses the requested local login when environment variables are absent', async () => {
    delete process.env.C2C_SUPER_ADMIN_NAME
    delete process.env.C2C_SUPER_ADMIN_PASSWORD

    const config = await loadDevelopmentConfig()

    expect(config.common.superAdminName).toBe('老伍')
    expect(config.common.superAdminPassword).toBe('123456')
  })

  it('allows local defaults to be overridden by environment variables', async () => {
    process.env.C2C_SUPER_ADMIN_NAME = 'configured-admin'
    process.env.C2C_SUPER_ADMIN_PASSWORD = 'configured-password'

    const config = await loadDevelopmentConfig()

    expect(config.common.superAdminName).toBe('configured-admin')
    expect(config.common.superAdminPassword).toBe('configured-password')
  })
})
