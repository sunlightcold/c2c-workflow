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
  const credentialRepository = { find: jest.fn() }
  const transaction = jest.fn()
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
    }).compile()
    service = module.get(MerchantPlatformCredentialService)
  })

  it('rotates one merchant credential version and never returns its secret reference', async () => {
    const lockedMerchant = { findOne: jest.fn().mockResolvedValue(merchant) }
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
        credentialRef: 'vault://c2c/binance/merchant-1/v3',
        clientType: 'WEB',
        requestTimeoutMs: 5000,
      }),
    ).resolves.toEqual({
      id: 'credential-3',
      merchantId,
      platform: MerchantPlatform.BINANCE,
      version: 3,
      status: BusinessStatus.ACTIVE,
      clientType: 'WEB',
      xUserId: null,
      requestTimeoutMs: 5000,
      credentialConfigured: true,
    })
    expect(credentials.update).toHaveBeenCalledWith(
      { tenantId, merchantId, status: BusinessStatus.ACTIVE },
      { status: BusinessStatus.DISABLED },
    )
  })

  it('rejects Binance credentials without a client type', async () => {
    transaction.mockImplementation((work) =>
      work({
        getRepository: () => ({ findOne: jest.fn().mockResolvedValue(merchant) }),
      }),
    )

    await expect(
      service.rotate(tenantId, merchantId, {
        credentialRef: 'vault://c2c/binance/merchant-1/v1',
        requestTimeoutMs: 5000,
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
        version: 1,
        credentialRef: 'vault://must-not-leak',
        status: BusinessStatus.ACTIVE,
        clientType: 'WEB',
        xUserId: null,
        requestTimeoutMs: 5000,
      },
    ])

    const result = await service.list(tenantId, merchantId)

    expect(credentialRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, merchantId } }),
    )
    expect(result).toEqual([expect.objectContaining({ credentialConfigured: true, version: 1 })])
    expect(result[0]).not.toHaveProperty('credentialRef')
  })
})
