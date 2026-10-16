import { EventEmitter2 } from '@nestjs/event-emitter'
/// <reference types="jest" />
import { DataSource } from 'typeorm'
import developmentConfig from '@/config/development'
import { C2C_FOUNDATION_IDS } from '@/apps/admin/database/migrations/c2c-business-foundation.migration'
import { adminMigrations } from '@/apps/admin/database/migrations'
import { IpProxyEntity, MerchantEntity, TenantEntity } from '@/apps/admin/database'
import { ProxyService } from '@/apps/admin/modules/proxy/proxy.service'
import { ProxyExpiryService } from '@/apps/admin/modules/proxy/proxy-expiry.service'
import { CredentialCipherService } from '@/apps/admin/modules/system/credential/credential-cipher.service'
import { ProxyListDto } from '@/apps/admin/modules/proxy/proxy.dto'

jest.mock('@/common/utils/config', () => ({
  getConfig: () => ({
    ...jest.requireActual('@/config/development').default.admin,
    credentialMasterKey: 'proxy-db-test-master-key',
  }),
}))

describe('IP proxy migration database integration', () => {
  const schema = `ip_proxy_test_${process.pid}_${Date.now()}`
  const tenantId = C2C_FOUNDATION_IDS.headquartersTenant
  const otherTenantId = '00000000-0000-4000-8000-000000000201'
  const proxyId = '00000000-0000-4000-8000-000000000202'
  const merchantId = '00000000-0000-4000-8000-000000000203'
  let admin: DataSource
  let database: DataSource
  beforeAll(async () => {
    admin = new DataSource({
      type: 'postgres',
      ...developmentConfig.admin.postgres,
      synchronize: false,
    })
    await admin.initialize()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    database = new DataSource({
      type: 'postgres',
      ...developmentConfig.admin.postgres,
      schema,
      synchronize: false,
      migrations: adminMigrations,
      entities: [IpProxyEntity, MerchantEntity, TenantEntity],
      migrationsTableName: 'schema_migrations',
      migrationsTransactionMode: 'each',
      extra: { options: `-c search_path=${schema},public` },
    })
    await database.initialize()
  })
  afterAll(async () => {
    if (database?.isInitialized) await database.destroy()
    if (admin?.isInitialized) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.destroy()
    }
  })
  it('applies once, validates constraints and records the migration', async () => {
    expect((await database.runMigrations()).map((m) => m.name)).toContain(
      'C2cIpProxies1789030000000',
    )
    await expect(database.runMigrations()).resolves.toEqual([])
    const [row] = await database.query(
      `SELECT count(*)::int AS count FROM schema_migrations WHERE name = 'C2cIpProxies1789030000000'`,
    )
    expect(row.count).toBe(1)
    await database.query(
      `INSERT INTO tenant (id,code,name,type,status,timezone) VALUES ($1,'proxy-other','Other','AGENT','active','Asia/Shanghai')`,
      [otherTenantId],
    )
    await database.query(
      `INSERT INTO ip_proxy (id,"tenantId",name,protocol,host,port,"passwordRef",fingerprint,"batchFingerprint") VALUES ($1,$2,'proxy','socks5h','::1',1080,'encrypted','key','batch')`,
      [proxyId, tenantId],
    )
    await database.query(
      `INSERT INTO merchant (id,"tenantId",code,name,platform,"apiBaseUrl") VALUES ($1,$2,'proxy-merchant','Merchant','BINANCE','https://example.invalid')`,
      [merchantId, otherTenantId],
    )
  })
  it('rejects cross-tenant bindings and deleting a bound proxy', async () => {
    await expect(
      database.query(`UPDATE merchant SET "proxyId"=$1 WHERE id=$2`, [proxyId, merchantId]),
    ).rejects.toMatchObject({ code: '23503' })
    await database.query(`UPDATE merchant SET "tenantId"=$1,"proxyId"=$2 WHERE id=$3`, [
      tenantId,
      proxyId,
      merchantId,
    ])
    await expect(
      database.query('DELETE FROM ip_proxy WHERE id=$1', [proxyId]),
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      database.query('UPDATE ip_proxy SET port=0 WHERE id=$1', [proxyId]),
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      database.query("UPDATE ip_proxy SET protocol='ftp' WHERE id=$1", [proxyId]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('executes scoped ORM CRUD, import, sorted pagination and expiry policies against migrated tables', async () => {
    const service = new ProxyService(
      database.getRepository(IpProxyEntity),
      database.getRepository(MerchantEntity),
      database,
      new CredentialCipherService(),
      new EventEmitter2(),
    )
    const backup = await service.create(tenantId, {
      name: 'backup',
      protocol: 'http',
      host: 'backup.invalid',
      port: 8080,
      password: 'db-test-canary',
    })
    const primary = await service.create(tenantId, {
      name: 'primary',
      protocol: 'socks5h',
      host: 'primary.invalid',
      port: 1080,
      fallback_mode: 'proxy',
      backup_proxy_id: backup.id,
    })
    await service.bind(tenantId, merchantId, primary.id)
    const list = await service.list(
      tenantId,
      Object.assign(new ProxyListDto(), { sort_by: 'account_count', sort_order: 'desc' }),
    )
    expect(list.items.find((item) => item.id === primary.id)?.account_count).toBe(1)
    expect(JSON.stringify(list)).not.toContain('db-test-canary')
    expect((await service.list(otherTenantId, new ProxyListDto())).total).toBe(0)
    await expect(service.bind(otherTenantId, merchantId, backup.id)).rejects.toThrow()
    const exported = await service.exportData(
      tenantId,
      Object.assign(new ProxyListDto(), { ids: primary.id }),
    )
    expect(exported.proxies[0]).toMatchObject({
      fallback_mode: 'proxy',
      backup_proxy_name: 'backup',
    })
    expect(JSON.stringify(exported)).not.toContain('db-test-canary')
    const imported = await service.importData(tenantId, {
      proxies: [
        {
          protocol: 'https',
          name: 'imported',
          host: 'import.invalid',
          port: 443,
          fallback_mode: 'proxy',
          backup_proxy_name: 'backup',
        },
      ],
      accounts: [],
    })
    expect(imported).toMatchObject({ proxy_created: 1, proxy_failed: 0 })
    await expect(service.remove(tenantId, backup.id)).rejects.toThrow()
    await service.update(tenantId, primary.id, { expires_at: 1 })
    const expiry = new ProxyExpiryService(database)
    await expiry.sweepTenant(tenantId)
    expect(
      (await database.getRepository(MerchantEntity).findOneByOrFail({ tenantId, id: merchantId }))
        .proxyId,
    ).toBe(backup.id)
    await service.update(tenantId, backup.id, { expires_at: 1, fallback_mode: 'direct' })
    await expiry.sweepTenant(tenantId)
    expect(
      (await database.getRepository(MerchantEntity).findOneByOrFail({ tenantId, id: merchantId }))
        .proxyId,
    ).toBeNull()
  })
})
