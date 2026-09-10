import { BadRequestException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import {
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
} from '@admin/database'
import { PaymentConfigService } from './payment-config.service'

describe('PaymentConfigService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const accountId = '00000000-0000-4000-8000-000000000030'
  const accountChannelId = '00000000-0000-4000-8000-000000000040'
  const repositories = {
    merchant: { findOne: jest.fn() },
    account: {
      create: jest.fn((value) => value),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    },
    accountChannel: { createQueryBuilder: jest.fn(), findOne: jest.fn() },
    plan: {
      create: jest.fn((value) => value),
      find: jest.fn(),
      save: jest.fn(async (value) => value),
    },
    platform: { find: jest.fn(), findOne: jest.fn() },
    channel: { find: jest.fn(), findOne: jest.fn() },
  }
  let service: PaymentConfigService

  beforeEach(async () => {
    jest.clearAllMocks()
    repositories.merchant.findOne.mockResolvedValue({ id: merchantId, tenantId })
    repositories.account.findOne.mockResolvedValue({ id: accountId, tenantId, status: 'active' })
    repositories.accountChannel.findOne.mockResolvedValue({
      id: accountChannelId,
      paymentAccountId: accountId,
      status: 'active',
    })
    const module = await Test.createTestingModule({
      providers: [
        PaymentConfigService,
        { provide: getRepositoryToken(MerchantEntity), useValue: repositories.merchant },
        { provide: getRepositoryToken(PaymentAccountEntity), useValue: repositories.account },
        {
          provide: getRepositoryToken(PaymentAccountChannelEntity),
          useValue: repositories.accountChannel,
        },
        {
          provide: getRepositoryToken(MerchantPaymentPlanEntity),
          useValue: repositories.plan,
        },
        { provide: getRepositoryToken(PaymentPlatformEntity), useValue: repositories.platform },
        { provide: getRepositoryToken(PaymentChannelEntity), useValue: repositories.channel },
      ],
    }).compile()
    service = module.get(PaymentConfigService)
  })

  it('persists the account and its enabled channel as one routing target', async () => {
    await service.createPlan(tenantId, {
      merchantId,
      paymentAccountId: accountId,
      paymentAccountChannelId: accountChannelId,
      scene: 'C2C_BUY',
      currency: 'CNY',
      priority: 10,
      weight: 100,
    })

    expect(repositories.plan.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        merchantId,
        paymentAccountId: accountId,
        paymentAccountChannelId: accountChannelId,
      }),
    )
  })

  it('does not return a payment account Secret reference after creation', async () => {
    repositories.platform.findOne.mockResolvedValue({ id: 'platform-1', status: 'active' })

    const result = await service.createAccount(tenantId, {
      platformId: 'platform-1',
      code: 'alipay-1',
      name: 'Alipay 1',
      externalAccountId: '2088',
      credentialRef: 'env://ALIPAY_ACCOUNT_1',
    })

    expect(result).not.toHaveProperty('credentialRef')
    expect(repositories.account.save).toHaveBeenCalledWith(
      expect.objectContaining({ credentialRef: 'env://ALIPAY_ACCOUNT_1' }),
    )
  })

  it('rejects a channel that is not opened under the selected account', async () => {
    repositories.accountChannel.findOne.mockResolvedValue({
      id: accountChannelId,
      paymentAccountId: '00000000-0000-4000-8000-000000000099',
      status: 'active',
    })

    await expect(
      service.createPlan(tenantId, {
        merchantId,
        paymentAccountId: accountId,
        paymentAccountChannelId: accountChannelId,
        scene: 'C2C_BUY',
        currency: 'CNY',
        priority: 10,
        weight: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('returns tenant payment configuration without credential references', async () => {
    const accountChannelQuery = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    }
    repositories.platform.find.mockResolvedValue([
      { id: 'platform-1', code: 'ALIPAY', name: '支付宝', status: 'active' },
    ])
    repositories.channel.find.mockResolvedValue([
      {
        id: 'channel-1',
        platformId: 'platform-1',
        code: 'ALIPAY_BATCH',
        name: '支付宝批量有密',
        status: 'active',
      },
    ])
    repositories.account.find.mockResolvedValue([
      {
        id: accountId,
        tenantId,
        platformId: 'platform-1',
        code: 'alipay-1',
        name: 'Alipay 1',
        externalAccountId: '2088',
        credentialRef: 'secret://must-not-leak',
        status: 'active',
      },
    ])
    accountChannelQuery.getMany.mockResolvedValue([
      {
        id: accountChannelId,
        paymentAccountId: accountId,
        channelId: 'channel-1',
        configRef: 'secret://must-not-leak',
        status: 'active',
      },
    ])
    repositories.accountChannel.createQueryBuilder.mockReturnValue(accountChannelQuery)

    const catalog = await service.listCatalog()
    const accounts = await service.listAccounts(tenantId)

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'platform-1',
        channels: [expect.objectContaining({ id: 'channel-1' })],
      }),
    ])
    expect(accounts).toEqual([
      expect.objectContaining({
        id: accountId,
        credentialConfigured: true,
        channels: [expect.objectContaining({ id: accountChannelId, channelId: 'channel-1' })],
      }),
    ])
    expect(accounts[0]).not.toHaveProperty('credentialRef')
    expect(accounts[0].channels[0]).not.toHaveProperty('configRef')
    expect(repositories.account.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    )
    expect(accountChannelQuery.where).toHaveBeenCalledWith('account."tenantId" = :tenantId', {
      tenantId,
    })
  })

  it('scopes payment plans to the tenant and optional merchant', async () => {
    repositories.plan.find.mockResolvedValue([])

    await service.listPlans(tenantId, merchantId)

    expect(repositories.plan.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId, merchantId } }),
    )
  })
})
