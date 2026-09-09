import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { MerchantEntity, MerchantPlatform } from '@admin/database'
import { BusinessScopeService } from './business-scope.service'
import { MerchantService } from './merchant.service'

describe('MerchantService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const repository = {
    create: jest.fn((value) => value),
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
  }
  let service: MerchantService

  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      providers: [
        MerchantService,
        BusinessScopeService,
        { provide: getRepositoryToken(MerchantEntity), useValue: repository },
      ],
    }).compile()
    service = module.get(MerchantService)
  })

  it('creates one merchant with one immutable platform', async () => {
    await service.create(tenantId, {
      code: 'merchant-1',
      name: 'Merchant One',
      platform: MerchantPlatform.BINANCE,
    })

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, platform: MerchantPlatform.BINANCE }),
    )
  })

  it('does not expose platform as an editable field', async () => {
    repository.findOne.mockResolvedValue({
      id: merchantId,
      tenantId,
      platform: MerchantPlatform.BINANCE,
      name: 'Merchant One',
    })

    const maliciousInput: { name: string; platform: MerchantPlatform } = {
      name: 'Renamed',
      platform: MerchantPlatform.OKX,
    }
    await expect(service.update(tenantId, merchantId, maliciousInput)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })
})
