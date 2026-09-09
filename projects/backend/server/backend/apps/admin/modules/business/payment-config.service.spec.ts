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
    account: { findOne: jest.fn() },
    accountChannel: { findOne: jest.fn() },
    plan: { create: jest.fn((value) => value), save: jest.fn(async (value) => value) },
    platform: { findOne: jest.fn() },
    channel: { findOne: jest.fn() },
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
})
