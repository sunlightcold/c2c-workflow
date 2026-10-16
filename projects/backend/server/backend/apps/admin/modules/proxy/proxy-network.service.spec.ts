import { BadRequestException } from '@nestjs/common'
import axios from 'axios'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Repository } from 'typeorm'
import type { IpProxyEntity, MerchantEntity } from '@admin/database'
import type { CredentialCipherService } from '../system/credential/credential-cipher.service'
import { AxiosC2cHttpTransport } from '../c2c-platform/axios-c2c-http.transport'
import { BinanceC2cClient } from '../c2c-platform/binance-c2c.client'
import { createProxyAgents, ProxyNetworkService } from './proxy-network.service'

describe('proxy egress', () => {
  it('routes HTTP through an authenticated proxy using a standard agent', async () => {
    const requests: Array<{ url?: string; auth?: string }> = []
    const server = createServer((req, res) => {
      requests.push({ url: req.url, auth: req.headers['proxy-authorization'] })
      res.end('{"ok":true}')
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const agents = createProxyAgents(
      {
        protocol: 'http',
        host: '127.0.0.1',
        port: (server.address() as AddressInfo).port,
        username: 'user',
      },
      'p@ss',
    )
    try {
      const result = await axios.get('http://upstream.invalid/test', { ...agents, proxy: false })
      expect(result.data).toEqual({ ok: true })
      expect(requests).toEqual([
        {
          url: 'http://upstream.invalid/test',
          auth: `Basic ${Buffer.from('user:p@ss').toString('base64')}`,
        },
      ])
    } finally {
      agents.destroy()
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
  })

  it('sends Binance presigned uploads through the merchant proxy without API credentials', async () => {
    const tunnels: Array<{ url?: string; auth?: string }> = []
    const requests: Array<{
      url?: string
      method?: string
      auth?: string
      apiKey?: string
      body: string
    }> = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        requests.push({
          url: req.url,
          method: req.method,
          auth: req.headers['proxy-authorization'],
          apiKey: req.headers['x-mbx-apikey'] as string | undefined,
          body: Buffer.concat(chunks).toString(),
        })
        res.end('uploaded')
      })
    })
    server.on('connect', (req, socket) => {
      tunnels.push({ url: req.url, auth: req.headers['proxy-authorization'] })
      socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n')
    })
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve)
    })
    const proxies = {
      findOne: jest.fn().mockResolvedValue({
        protocol: 'http',
        host: '127.0.0.1',
        port: (server.address() as AddressInfo).port,
        username: 'user',
        passwordConfigured: true,
        passwordRef: 'encrypted',
        status: 'active',
      }),
    }
    const merchants = { findOne: jest.fn().mockResolvedValue({ proxyId: 'proxy-1' }) }
    const network = new ProxyNetworkService(
      proxies as unknown as Repository<IpProxyEntity>,
      merchants as unknown as Repository<MerchantEntity>,
      { decrypt: () => 'p@ss' } as unknown as CredentialCipherService,
    )
    const client = new BinanceC2cClient(new AxiosC2cHttpTransport(network), network)
    const proxyScope = { tenantId: 'tenant-1', merchantId: 'merchant-1' }
    try {
      await expect(
        client.uploadComplaintFile(
          {
            proxyScope,
            apiKey: 'merchant-api-key',
            secretKey: 'merchant-secret',
            clientType: 'WEB',
            timeoutMs: 1000,
          },
          'http://upload.invalid/proof.jpg?signature=presigned',
          Buffer.from('proof'),
        ),
      ).resolves.toBe('uploaded')
      expect(requests).toEqual([
        {
          method: 'PUT',
          url: 'http://upload.invalid/proof.jpg?signature=presigned',
          auth: `Basic ${Buffer.from('user:p@ss').toString('base64')}`,
          apiKey: undefined,
          body: 'proof',
        },
      ])
      expect(merchants.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: proxyScope.merchantId, tenantId: proxyScope.tenantId },
        }),
      )
      expect(proxies.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'proxy-1', tenantId: proxyScope.tenantId },
        }),
      )
      await expect(
        client.uploadComplaintFile(
          {
            proxyScope,
            apiKey: 'merchant-api-key',
            secretKey: 'merchant-secret',
            clientType: 'WEB',
            timeoutMs: 1000,
          },
          'https://upload.invalid/proof.jpg?signature=presigned',
          Buffer.from('proof'),
        ),
      ).rejects.toThrow('代理出口请求失败')
      expect(tunnels).toEqual([
        {
          url: 'upload.invalid:443',
          auth: `Basic ${Buffer.from('user:p@ss').toString('base64')}`,
        },
      ])
      expect(requests).toHaveLength(1)
    } finally {
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
  })

  it('fails closed for disabled or expired bound proxies', async () => {
    const proxies = { findOne: jest.fn().mockResolvedValue({ status: 'inactive' }) }
    const merchants = { findOne: jest.fn().mockResolvedValue({ proxyId: 'proxy-1' }) }
    const network = new ProxyNetworkService(
      proxies as unknown as Repository<IpProxyEntity>,
      merchants as unknown as Repository<MerchantEntity>,
      null as unknown as CredentialCipherService,
    )
    const transport = new AxiosC2cHttpTransport(network)
    const binance = new BinanceC2cClient(transport, network)
    const request = jest.spyOn(axios, 'request')
    const upload = () =>
      binance.uploadComplaintFile(
        {
          apiKey: 'key',
          secretKey: 'secret',
          clientType: 'WEB',
          timeoutMs: 1000,
          proxyScope: { tenantId: 'tenant-1', merchantId: 'merchant-1' },
        },
        'https://upload.invalid/proof.jpg',
        Buffer.from('proof'),
      )
    try {
      await expect(
        transport.request({
          method: 'GET',
          url: 'https://upstream.invalid',
          headers: {},
          timeoutMs: 1000,
          proxyScope: { tenantId: 'tenant-1', merchantId: 'merchant-1' },
        }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(upload()).rejects.toBeInstanceOf(BadRequestException)
      expect(request).not.toHaveBeenCalled()
      expect(proxies.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'proxy-1', tenantId: 'tenant-1' } }),
      )
      proxies.findOne.mockResolvedValue({ status: 'active', expiresAt: new Date(0) })
      await expect(
        network.forMerchant({ tenantId: 'tenant-1', merchantId: 'merchant-1' }),
      ).rejects.toBeInstanceOf(BadRequestException)
      await expect(upload()).rejects.toBeInstanceOf(BadRequestException)
      expect(request).not.toHaveBeenCalled()
    } finally {
      request.mockRestore()
    }
  })
})
