import axios from 'axios'
import type { Repository } from 'typeorm'
import type { IpProxyEntity } from '@admin/database'
import type { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { ProxyProbeService } from './proxy-probe.service'
import type { ProxyService } from './proxy.service'

describe('sub2api proxy probe success conditions', () => {
  const repository = { update: jest.fn() }
  const proxies = {
    get: jest.fn().mockResolvedValue({
      protocol: 'http',
      host: '127.0.0.1',
      port: 8080,
      username: '',
      passwordConfigured: false,
      fingerprint: 'configuration',
    }),
  }
  const service = new ProxyProbeService(
    proxies as unknown as ProxyService,
    { decrypt: jest.fn() } as unknown as CredentialCipherService,
    repository as unknown as Repository<IpProxyEntity>,
  )

  afterEach(() => jest.restoreAllMocks())

  it.each([
    { status: 200, data: { status: 'fail', query: '192.0.2.1' } },
    { status: 201, data: { status: 'success', query: '192.0.2.1' } },
    { status: 200, data: { status: 'success', ip: '192.0.2.1' } },
  ])('tries ipify through the same proxy when ip-api fails: %j', async (primary) => {
    const get = jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce(primary)
      .mockResolvedValueOnce({ status: 200, data: { ip: '192.0.2.2' } })
    await expect(service.test('tenant-1', 'proxy-1')).resolves.toMatchObject({
      success: true,
      ip_address: '192.0.2.2',
    })
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      'http://ip-api.com/json/?lang=zh-CN',
      'http://api64.ipify.org?format=json',
    ])
    const primaryConfig = get.mock.calls[0][1]!
    expect(get.mock.calls[1][1]).toMatchObject({
      httpAgent: primaryConfig.httpAgent,
      httpsAgent: primaryConfig.httpsAgent,
      proxy: false,
    })
  })

  it('accepts HTTP 200 ip-api success and preserves its location', async () => {
    const get = jest.spyOn(axios, 'get').mockResolvedValue({
      status: 200,
      data: { status: 'SUCCESS', query: '192.0.2.1', country: 'Singapore', region: 'SG' },
    })
    await expect(service.test('tenant-1', 'proxy-1')).resolves.toMatchObject({
      success: true,
      ip_address: '192.0.2.1',
      country: 'Singapore',
      region: 'SG',
    })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('reports failure when neither fixed target returns its expected HTTP 200 payload', async () => {
    jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({ status: 200, data: { status: 'fail', query: '192.0.2.1' } })
      .mockResolvedValueOnce({ status: 201, data: { ip: '192.0.2.2' } })
    await expect(service.test('tenant-1', 'proxy-1')).resolves.toMatchObject({ success: false })
  })
})
