import {
  BusinessStatus,
  MerchantEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
} from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { MerchantPlatformCredentialService } from './merchant-platform-credential.service'

describe('MerchantPlatformCredentialService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const merchant = { id: merchantId, tenantId, platform: MerchantPlatform.BINANCE }
  const merchantRepository = { findOne: jest.fn() }
  const credentialRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  }
  const transaction = jest.fn()
  const cipher = { encrypt: jest.fn().mockReturnValue('encrypted-value'), decrypt: jest.fn() }
  const credentialFactory = { create: jest.fn() }
  const platformClient = { listOrders: jest.fn() }
  let service: MerchantPlatformCredentialService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        MerchantPlatformCredentialService,
        { provide: getRepositoryToken(MerchantEntity), useValue: merchantRepository },
        {
          provide: getRepositoryToken(MerchantPlatformCredentialEntity),
          useValue: credentialRepository,
        },
        { provide: DataSource, useValue: { transaction } },
      ],
    })
      .useMocker((token) => {
        if (typeof token === 'function' && token.name === 'CredentialCipherService') return cipher
        if (typeof token === 'function' && token.name === 'C2cPlatformCredentialFactory')
          return credentialFactory
        if (typeof token === 'function' && token.name === 'C2cPlatformClient') return platformClient
        return undefined
      })
      .compile()
    service = module.get(MerchantPlatformCredentialService)
  })

  it('rotates one merchant credential version and never returns its secret', async () => {
    const lockedMerchant = {
      findOne: jest.fn().mockResolvedValue({
        ...merchant,
        apiBaseUrl: 'https://api.binance.com',
        requestTimeoutMs: 15000,
      }),
    }
    const credentials = {
      findOne: jest.fn().mockResolvedValue({ version: 2 }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => ({ id: 'credential-3', ...value })),
    }
    transaction.mockImplementation((work) =>
      work({
        getRepository: (entity) => (entity === MerchantEntity ? lockedMerchant : credentials),
      }),
    )

    await expect(
      service.rotate(tenantId, merchantId, {
        apiKey: 'binance-key',
        secretKey: 'binance-secret',
        clientType: 'WEB',
        requestTimeoutMs: 15000,
      }),
    ).resolves.toEqual({
      id: 'credential-3',
      merchantId,
      platform: MerchantPlatform.BINANCE,
      authMode: 'API_KEY',
      version: 3,
      status: BusinessStatus.ACTIVE,
      clientType: 'WEB',
      xUserId: null,
      requestTimeoutMs: 15000,
      credentialConfigured: true,
    })
    expect(credentials.update).toHaveBeenCalledWith(
      { tenantId, merchantId, status: BusinessStatus.ACTIVE },
      { status: BusinessStatus.DISABLED },
    )
    expect(credentials.save).toHaveBeenCalledWith(
      expect.objectContaining({ credentialRef: 'enc://encrypted-value' }),
    )
    expect(JSON.stringify(credentials.save.mock.calls[0][0])).not.toContain('binance-secret')
  })

  it('rejects incomplete Binance credentials', async () => {
    transaction.mockImplementation((work) =>
      work({
        getRepository: () => ({ findOne: jest.fn().mockResolvedValue(merchant) }),
      }),
    )

    await expect(
      service.rotate(tenantId, merchantId, {
        apiKey: 'binance-key',
        requestTimeoutMs: 15000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('lists only metadata scoped to the merchant tenant', async () => {
    merchantRepository.findOne.mockResolvedValue(merchant)
    credentialRepository.find.mockResolvedValue([
      {
        id: 'credential-1',
        merchantId,
        platform: MerchantPlatform.BINANCE,
        authMode: 'API_KEY',
        version: 1,
        credentialRef: 'vault://must-not-leak',
        status: BusinessStatus.ACTIVE,
        clientType: 'WEB',
        xUserId: null,
        apiBaseUrl: 'https://api.binance.com',
        requestTimeoutMs: 15000,
      },
    ])

    const result = await service.list(tenantId, merchantId)

    expect(credentialRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, merchantId } }),
    )
    expect(result).toEqual([expect.objectContaining({ credentialConfigured: true, version: 1 })])
    expect(result[0]).not.toHaveProperty('credentialRef')
  })

  it('deletes only inactive credential versions in the merchant tenant', async () => {
    merchantRepository.findOne.mockResolvedValue(merchant)
    credentialRepository.findOne.mockResolvedValue({
      id: 'credential-1',
      merchantId,
      status: BusinessStatus.DISABLED,
    })

    const result = await service.remove(tenantId, merchantId, 'credential-1')

    expect(result).toBeUndefined()
    expect(credentialRepository.remove).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'credential-1' }),
    )
  })

  it('keeps the active credential version undeletable', async () => {
    merchantRepository.findOne.mockResolvedValue(merchant)
    credentialRepository.findOne.mockResolvedValue({
      id: 'credential-1',
      merchantId,
      status: BusinessStatus.ACTIVE,
    })

    await expect(service.remove(tenantId, merchantId, 'credential-1')).rejects.toThrow(
      '当前生效凭据不能删除',
    )
    expect(credentialRepository.remove).not.toHaveBeenCalled()
  })

  it('tests the active Binance credential against its configured gateway', async () => {
    merchantRepository.findOne.mockResolvedValue({
      ...merchant,
      orderStatusList: [1],
    })
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        credentialRef: 'enc://encrypted-value',
        apiBaseUrl: 'http://127.0.0.1:13002/upstreams/binance',
        clientType: 'WEB',
        xUserId: null,
        requestTimeoutMs: 15000,
      }),
    }
    credentialRepository.createQueryBuilder.mockReturnValue(queryBuilder)
    cipher.decrypt.mockReturnValue('{"apiKey":"key","secretKey":"secret"}')
    const resolved = {
      apiKey: 'key',
      secretKey: 'secret',
      clientType: 'WEB',
      timeoutMs: 15000,
      baseUrl: 'http://127.0.0.1:13002/upstreams/binance',
    }
    credentialFactory.create.mockReturnValue(resolved)
    platformClient.listOrders.mockResolvedValue({ items: [], total: 0 })

    await expect(service.testConnection(tenantId, merchantId)).resolves.toEqual({
      success: true,
      platform: MerchantPlatform.BINANCE,
    })
    expect(platformClient.listOrders).toHaveBeenCalledWith(
      MerchantPlatform.BINANCE,
      resolved,
      expect.objectContaining({ rows: 1, orderStatusList: [1] }),
    )
  })
})
