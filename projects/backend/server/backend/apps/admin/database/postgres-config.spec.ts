import developmentConfig from '@/config/development'
import productionConfig from '@/config/production'

describe('admin postgres configuration', () => {
  it('disables TypeORM schema synchronization in development and production', () => {
    expect(developmentConfig.admin.postgres.synchronize).toBe(false)
    expect(productionConfig.admin.postgres.synchronize).toBe(false)
  })
})
