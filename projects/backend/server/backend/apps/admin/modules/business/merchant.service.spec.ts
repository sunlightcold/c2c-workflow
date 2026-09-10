import { MerchantEntity, MerchantPlatform } from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { MerchantService } from './merchant.service'

describe('MerchantService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const merchantRepository = { findAndCount: jest.fn() }
  const credentialRepository = { find: jest.fn() }
  const cipher = { encrypt: jest.fn().mockReturnValue('encrypted-value') }
  const merchantTxRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: merchantId, ...value })),
  }
  const credentialTxRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'credential-1', ...value })),
  }
  const dataSource = {
    transaction: jest.fn((work) =>
      work({
        getRepository: (entity: unknown) =>
          entity === MerchantEntity ? merchantTxRepository : credentialTxRepository,
      }),
    ),
  }
  const service = new MerchantService(
    merchantRepository as never,
    credentialRepository as never,
    dataSource as never,
    cipher as never,
  )

  beforeEach(() => jest.clearAllMocks())

  it('creates one Binance merchant account and its encrypted credential atomically', async () => {
    await expect(
      service.create(tenantId, {
        code: 'merchant-1',
        name: 'Merchant One',
        platform: MerchantPlatform.BINANCE,
        externalMerchantId: 'binance-merchant-1',
        authMode: 'API_KEY',
        apiKey: 'binance-api-key',
        secretKey: 'binance-secret-key',
      }),
    ).resolves.toMatchObject({
      id: merchantId,
      platform: MerchantPlatform.BINANCE,
      credentialConfigured: true,
    })

    expect(dataSource.transaction).toHaveBeenCalledTimes(1)
    expect(cipher.encrypt).toHaveBeenCalledWith(
      JSON.stringify({ apiKey: 'binance-api-key', secretKey: 'binance-secret-key' }),
    )
    expect(credentialTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantId,
        platform: MerchantPlatform.BINANCE,
        authMode: 'API_KEY',
        credentialRef: 'enc://encrypted-value',
      }),
    )
    const saved = credentialTxRepository.save.mock.calls[0][0]
    expect(JSON.stringify(saved)).not.toContain('binance-api-key')
    expect(JSON.stringify(saved)).not.toContain('binance-secret-key')
  })

  it('rejects credentials that do not match the selected platform', async () => {
    expect(() =>
      service.create(tenantId, {
        code: 'merchant-1',
        name: 'Merchant One',
        platform: MerchantPlatform.OKX,
        externalMerchantId: 'okx-merchant-1',
        authMode: 'API_KEY',
        apiKey: 'wrong-kind',
        secretKey: 'wrong-kind',
      }),
    ).toThrow(BadRequestException)
    expect(dataSource.transaction).not.toHaveBeenCalled()
  })

  it('does not expose platform as an editable field', async () => {
    const maliciousInput = {
      name: 'Renamed',
      platform: MerchantPlatform.OKX,
    }
    await expect(service.update(tenantId, merchantId, maliciousInput)).rejects.toBeInstanceOf(
      BadRequestException,
    )
  })

  it('lists only accounts from the selected tenant and marks configured credentials', async () => {
    merchantRepository.findAndCount.mockResolvedValue([
      [{ id: merchantId, tenantId, name: 'Merchant One' }],
      1,
    ])
    credentialRepository.find.mockResolvedValue([{ merchantId, authMode: 'API_KEY' }])

    await expect(service.list(tenantId, { page: 1, pageSize: 20 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: merchantId,
          credentialConfigured: true,
          authMode: 'API_KEY',
        }),
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    expect(merchantRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    )
    expect(credentialRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId }) }),
    )
  })
})
