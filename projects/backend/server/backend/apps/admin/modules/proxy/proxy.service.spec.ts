import { EventEmitter2 } from '@nestjs/event-emitter'
import { BadRequestException } from '@nestjs/common'
import { ProxyService } from './proxy.service'
import { summarizeProxyQuality } from './proxy-probe.service'
import type { CredentialCipherService } from '../system/credential/credential-cipher.service'
import type { IpProxyEntity, MerchantEntity } from '@admin/database'
import type { DataSource, Repository } from 'typeorm'

jest.mock('@/common/utils/config', () => ({
  getConfig: () => ({ credentialMasterKey: 'proxy-test-master-key', postgres: {} }),
}))

describe('sub2api proxy data contract', () => {
  const repository = {
    findOneBy: jest.fn(),
    create: jest.fn((input) => ({ ...input, id: 'proxy-id' })),
    save: jest.fn(async (input) => input),
  }
  const cipher = {
    encrypt: jest.fn(() => 'encrypted-test-password'),
    decrypt: jest.fn(() => 'password'),
  }
  const service = new ProxyService(
    repository as unknown as Repository<IpProxyEntity>,
    null as unknown as Repository<MerchantEntity>,
    null as unknown as DataSource,
    cipher as unknown as CredentialCipherService,
    new EventEmitter2(),
  )
  beforeEach(() => {
    jest.clearAllMocks()
    repository.findOneBy.mockResolvedValue(null)
  })

  it('imports original snake_case JSON with credentials, ignoring accounts', async () => {
    const result = await service.importData('tenant-1', {
      type: 'sub2api-bundle',
      version: 1,
      exported_at: '2026-10-16T00:00:00Z',
      proxies: [
        {
          proxy_key: 'untrusted|key|password',
          name: 'one',
          protocol: 'socks5h',
          host: '::1',
          port: 1080,
          username: 'user',
          password: 'password',
          expires_at: 1800000000,
          expiry_warn_days: 7,
          status: 'disabled',
        },
      ],
      accounts: [{ credentials: { api_key: 'ignored' } }],
    })
    expect(result).toMatchObject({
      proxy_created: 1,
      proxy_reused: 0,
      proxy_failed: 0,
      account_created: 0,
    })
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        protocol: 'socks5h',
        passwordRef: 'encrypted-test-password',
        status: 'inactive',
        expiresAt: new Date(1800000000000),
      }),
    )
    expect(JSON.stringify(result)).not.toContain('password')
  })

  it('keeps valid entries and returns sanitized failures per row', async () => {
    const result = await service.importData('tenant-1', {
      proxies: [
        {
          name: 'password-canary',
          protocol: 'http',
          host: 'host',
          port: 0,
          password: 'password-canary',
          proxy_key: 'password-canary',
        },
        { protocol: 'https', host: 'host', port: 443 },
      ],
      accounts: [],
    })
    expect(result).toMatchObject({ proxy_created: 1, proxy_failed: 1 })
    expect(JSON.stringify(result)).not.toContain('password-canary')
  })

  it('matches existing proxies only within the tenant and does not trust supplied keys', async () => {
    repository.findOneBy.mockResolvedValue({ id: 'existing', status: 'active' })
    const result = await service.importData('tenant-1', {
      proxies: [{ protocol: 'http', host: 'host', port: 80, proxy_key: 'other-tenant-key' }],
      accounts: [],
    })
    expect(result.proxy_reused).toBe(1)
    expect(repository.findOneBy).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    })
    expect(repository.save).not.toHaveBeenCalled()
  })

  it('does not return encrypted secrets or fingerprints from create', async () => {
    const view = await service.create('tenant-1', {
      name: 'one',
      protocol: 'http',
      host: 'host',
      port: 80,
      password: 'password-canary',
    })
    expect(view).not.toHaveProperty('passwordRef')
    expect(view).not.toHaveProperty('fingerprint')
    expect(JSON.stringify(view)).not.toContain('password-canary')
  })

  it('requires original migration arrays and rejects unsupported versions', async () => {
    await expect(service.importData('tenant-1', { proxies: [] })).rejects.toBeInstanceOf(
      BadRequestException,
    )
    await expect(
      service.importData('tenant-1', { version: 2, proxies: [], accounts: [] }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('retains upstream quality scoring and grade thresholds', () => {
    expect(
      summarizeProxyQuality([
        { target: 'a', status: 'challenge', message: '' },
        { target: 'b', status: 'warn', message: '' },
      ]),
    ).toMatchObject({ score: 60, grade: 'C', challenge_count: 1, warn_count: 1 })
  })
})
