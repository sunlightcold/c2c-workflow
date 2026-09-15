import {
  BusinessStatus,
  MerchantEntity,
  MerchantPlatform,
  MerchantPlatformCredentialEntity,
  PaymentSourceType,
  TelegramBotEntity,
  TelegramBotType,
  TelegramGroupBindingState,
  TelegramGroupEntity,
} from '@admin/database'
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
    findOne: jest.fn(),
    save: jest.fn(async (value) => ({ id: merchantId, ...value })),
  }
  const credentialTxRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 'credential-1', ...value })),
  }
  const groupTxRepository = { findOne: jest.fn() }
  const botTxRepository = { findOne: jest.fn() }
  const dataSource = {
    transaction: jest.fn((work) =>
      work({
        getRepository: (entity: unknown) => {
          if (entity === MerchantEntity) return merchantTxRepository
          if (entity === MerchantPlatformCredentialEntity) return credentialTxRepository
          if (entity === TelegramGroupEntity) return groupTxRepository
          if (entity === TelegramBotEntity) return botTxRepository
          throw new Error('Unexpected repository')
        },
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
    expect(merchantTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringMatching(/^MCH\d{20}$/) }),
    )
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
    expect(merchantTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        c2cChatOrderCreatedMessage: expect.stringContaining(
          '原则上不接受亲友、公司、员工、客户或其他第三方账户代收',
        ),
        c2cChatOrderPaidMessage: expect.stringContaining('请您登录核实收款账户实际到账情况'),
        c2cChatOrderCompletedMessage:
          expect.stringContaining('您的每一次认可都是我们持续做好服务的动力'),
      }),
    )
  })

  it('rejects credentials that do not match the selected platform', async () => {
    expect(() =>
      service.create(tenantId, {
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

  it('rejects an invalid OKX signing key before persisting credentials', () => {
    expect(() =>
      service.create(tenantId, {
        name: 'Merchant One',
        platform: MerchantPlatform.OKX,
        externalMerchantId: 'okx-merchant-1',
        authMode: 'WEB_COOKIE',
        sessionCookie: 'cookie',
        authorization: 'authorization',
        signaturePrivateKey: 'not-a-key',
      }),
    ).toThrow('PKCS#8 EC')
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

  it('binds a merchant only to its active C2C payment bot group', async () => {
    merchantTxRepository.findOne.mockResolvedValue({
      id: merchantId,
      tenantId,
      paidConfirmIntervalMinMs: 0,
      paidConfirmIntervalMaxMs: 0,
    })
    groupTxRepository.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000030',
      tenantId,
      merchantId,
      botId: '00000000-0000-4000-8000-000000000040',
      chatId: '-1001234567890',
      bindingState: TelegramGroupBindingState.ACTIVE,
      paymentScene: PaymentSourceType.C2C_BUY,
    })
    botTxRepository.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000040',
      tenantId,
      code: 'PAYMENT_BOT',
      botType: TelegramBotType.PAYMENT,
      status: BusinessStatus.ACTIVE,
    })

    await service.update(tenantId, merchantId, {
      telegramGroupId: '00000000-0000-4000-8000-000000000030',
    })

    expect(groupTxRepository.findOne).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-4000-8000-000000000030',
        tenantId,
        merchantId,
        bindingState: TelegramGroupBindingState.ACTIVE,
        paymentScene: PaymentSourceType.C2C_BUY,
      },
    })
    expect(merchantTxRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ botCode: 'PAYMENT_BOT', chatId: '-1001234567890' }),
    )
  })

  it('rejects a group that is not an active C2C group of the merchant', async () => {
    merchantTxRepository.findOne.mockResolvedValue({
      id: merchantId,
      tenantId,
      paidConfirmIntervalMinMs: 0,
      paidConfirmIntervalMaxMs: 0,
    })
    groupTxRepository.findOne.mockResolvedValue(null)

    await expect(
      service.update(tenantId, merchantId, {
        telegramGroupId: '00000000-0000-4000-8000-000000000031',
      }),
    ).rejects.toThrow('机器人群组未绑定到该商家账号')
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
