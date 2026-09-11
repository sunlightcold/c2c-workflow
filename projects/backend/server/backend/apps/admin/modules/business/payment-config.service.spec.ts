import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import {
  BusinessStatus,
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
  PaymentOrderEntity,
} from '@admin/database'
import { DataSource } from 'typeorm'
import { PaymentConfigService } from './payment-config.service'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'

describe('PaymentConfigService', () => {
  const tenantId = '00000000-0000-4000-8000-000000000010'
  const merchantId = '00000000-0000-4000-8000-000000000020'
  const accountId = '00000000-0000-4000-8000-000000000030'
  const accountChannelId = '00000000-0000-4000-8000-000000000040'
  const repositories = {
    merchant: { findOne: jest.fn() },
    account: {
      create: jest.fn((value) => value),
      findAndCount: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    },
    accountChannel: {
      create: jest.fn((value) => value),
      createQueryBuilder: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
    },
    plan: {
      create: jest.fn((value) => value),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (value) => value),
      exists: jest.fn(),
    },
    platform: { find: jest.fn(), findOne: jest.fn() },
    channel: { find: jest.fn(), findOne: jest.fn() },
  }
  const txRepositories = {
    account: { delete: jest.fn(), findOne: jest.fn() },
    accountChannel: { delete: jest.fn(), findOne: jest.fn() },
    plan: { delete: jest.fn(), exists: jest.fn(), findOne: jest.fn() },
    paymentOrder: { exists: jest.fn() },
    paymentBatch: { exists: jest.fn() },
  }
  const dataSource = {
    transaction: jest.fn((work) =>
      work({
        getRepository: (entity: unknown) => {
          if (entity === PaymentAccountEntity) return txRepositories.account
          if (entity === PaymentAccountChannelEntity) return txRepositories.accountChannel
          if (entity === MerchantPaymentPlanEntity) return txRepositories.plan
          if (entity === PaymentOrderEntity) return txRepositories.paymentOrder
          return txRepositories.paymentBatch
        },
      }),
    ),
  }
  const cipher = { encrypt: jest.fn(() => 'encrypted-payment-credential') }
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
    txRepositories.account.findOne.mockResolvedValue({ id: accountId, tenantId })
    txRepositories.accountChannel.findOne.mockResolvedValue({
      id: accountChannelId,
      paymentAccountId: accountId,
    })
    txRepositories.plan.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000050',
      tenantId,
    })
    txRepositories.plan.exists.mockResolvedValue(false)
    txRepositories.paymentOrder.exists.mockResolvedValue(false)
    txRepositories.paymentBatch.exists.mockResolvedValue(false)
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
        { provide: DataSource, useValue: dataSource },
        { provide: CredentialCipherService, useValue: cipher },
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

  it('updates a payment plan only inside its tenant', async () => {
    repositories.plan.findOne.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000050',
      tenantId,
      merchantId,
      paymentAccountId: accountId,
      paymentAccountChannelId: accountChannelId,
      priority: 100,
      weight: 100,
      status: 'active',
    })

    await service.updatePlan(tenantId, '00000000-0000-4000-8000-000000000050', {
      priority: 20,
      weight: 60,
    })

    expect(repositories.plan.findOne).toHaveBeenCalledWith({
      where: { id: '00000000-0000-4000-8000-000000000050', tenantId },
    })
    expect(repositories.plan.save).toHaveBeenCalledWith(
      expect.objectContaining({ priority: 20, weight: 60 }),
    )
  })

  it('deletes an unused payment plan only inside its tenant', async () => {
    const planId = '00000000-0000-4000-8000-000000000050'

    await service.removePlan(tenantId, planId)

    expect(txRepositories.plan.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: planId, tenantId } }),
    )
    expect(txRepositories.plan.delete).toHaveBeenCalledWith({ id: planId, tenantId })
  })

  it('disables a payment plan only inside its tenant', async () => {
    const planId = '00000000-0000-4000-8000-000000000050'
    repositories.plan.findOne.mockResolvedValue({
      id: planId,
      tenantId,
      merchantId,
      paymentAccountId: accountId,
      paymentAccountChannelId: accountChannelId,
      status: 'active',
    })

    await service.setPlanStatus(tenantId, planId, BusinessStatus.DISABLED)

    expect(repositories.plan.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: planId, status: 'disabled' }),
    )
  })

  it('protects a payment plan referenced by a payment order from deletion', async () => {
    txRepositories.paymentOrder.exists.mockResolvedValue(true)

    await expect(
      service.removePlan(tenantId, '00000000-0000-4000-8000-000000000050'),
    ).rejects.toBeInstanceOf(ConflictException)
    expect(txRepositories.plan.delete).not.toHaveBeenCalled()
  })

  it('encrypts the single key-mode credential and never returns its contents', async () => {
    repositories.platform.findOne.mockResolvedValue({
      id: 'platform-1',
      code: 'ALIPAY',
      status: 'active',
    })

    const result = await service.createAccount(tenantId, {
      platformId: 'platform-1',
      name: 'Alipay 1',
      externalAccountId: '2088',
      credential: {
        authMode: 'KEY',
        appId: '2026000000000001',
        gateway: 'https://openapi.alipay.com/gateway.do',
        privateKey: 'application-private-key',
        alipayPublicKey: 'alipay-public-key',
      },
    })

    expect(result).not.toHaveProperty('credentialRef')
    expect(result).not.toHaveProperty('privateKey')
    expect(cipher.encrypt).toHaveBeenCalledWith(
      JSON.stringify({
        authMode: 'KEY',
        appId: '2026000000000001',
        gateway: 'https://openapi.alipay.com/gateway.do',
        privateKey: 'application-private-key',
        alipayPublicKey: 'alipay-public-key',
      }),
    )
    expect(repositories.account.save).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.stringMatching(/^PAC\d{20}$/),
        credentialAuthMode: 'KEY',
        credentialAppId: '2026000000000001',
        credentialRef: 'enc://encrypted-payment-credential',
      }),
    )
  })

  it('rejects an incomplete certificate-mode credential', async () => {
    repositories.platform.findOne.mockResolvedValue({
      id: 'platform-1',
      code: 'ALIPAY',
      status: 'active',
    })

    await expect(
      service.createAccount(tenantId, {
        platformId: 'platform-1',
        name: 'Alipay 1',
        externalAccountId: '2088',
        credential: {
          authMode: 'CERT',
          appId: '2026000000000001',
          gateway: 'https://openapi.alipay.com/gateway.do',
          privateKey: 'application-private-key',
          appCertContent: 'app-cert',
        },
      }),
    ).rejects.toThrow('支付宝证书配置不完整')
    expect(repositories.account.save).not.toHaveBeenCalled()
  })

  it('replaces the one credential configured on the payment account', async () => {
    repositories.account.findOne.mockResolvedValue({
      id: accountId,
      tenantId,
      credentialRef: 'enc://old',
    })

    const result = await service.updateAccountCredential(tenantId, accountId, {
      authMode: 'KEY',
      appId: '2026000000000002',
      gateway: 'https://openapi.alipay.com/gateway.do',
      privateKey: 'new-private-key',
      alipayPublicKey: 'new-alipay-public-key',
    })

    expect(repositories.account.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: accountId,
        credentialAuthMode: 'KEY',
        credentialAppId: '2026000000000002',
        credentialRef: 'enc://encrypted-payment-credential',
      }),
    )
    expect(result).not.toHaveProperty('credentialRef')
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
    repositories.account.findAndCount.mockResolvedValue([
      [
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
      ],
      1,
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
    const accounts = await service.listAccounts(tenantId, { page: 1, pageSize: 20 })

    expect(catalog).toEqual([
      expect.objectContaining({
        id: 'platform-1',
        channels: [expect.objectContaining({ id: 'channel-1' })],
      }),
    ])
    expect(accounts).toEqual(
      expect.objectContaining({
        items: [
          expect.objectContaining({
            id: accountId,
            credentialConfigured: true,
            channels: [expect.objectContaining({ id: accountChannelId, channelId: 'channel-1' })],
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      }),
    )
    expect(accounts.items[0]).not.toHaveProperty('credentialRef')
    expect(accounts.items[0].channels[0]).not.toHaveProperty('configRef')
    expect(repositories.account.findAndCount).toHaveBeenCalledWith(
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

  it('updates editable account fields without returning its credential reference', async () => {
    repositories.account.findOne.mockResolvedValue({
      id: accountId,
      tenantId,
      name: '旧名称',
      externalAccountId: '2088',
      credentialRef: 'env://OLD_SECRET',
    })

    const result = await service.updateAccount(tenantId, accountId, {
      name: '主支付账号',
    })

    expect(repositories.account.findOne).toHaveBeenCalledWith({
      where: { id: accountId, tenantId },
    })
    expect(repositories.account.save).toHaveBeenCalledWith(
      expect.objectContaining({ name: '主支付账号', credentialRef: 'env://OLD_SECRET' }),
    )
    expect(result).not.toHaveProperty('credentialRef')
  })

  it('rejects a payment channel amount range whose minimum exceeds its maximum', async () => {
    repositories.account.findOne.mockResolvedValue({
      id: accountId,
      tenantId,
      platformId: 'platform-1',
      status: 'active',
    })
    repositories.channel.findOne.mockResolvedValue({
      id: 'channel-1',
      platformId: 'platform-1',
      status: 'active',
    })

    await expect(
      service.openAccountChannel(tenantId, accountId, {
        channelId: 'channel-1',
        minimumAmount: '50000.01',
        maximumAmount: '50000.00',
        concurrencyLimit: 2,
      }),
    ).rejects.toThrow('最小支付金额不能大于最大支付金额')
    expect(repositories.accountChannel.save).not.toHaveBeenCalled()
  })

  it('rejects account channel access through another tenant', async () => {
    repositories.account.findOne.mockResolvedValue(null)

    await expect(
      service.updateAccountChannel(tenantId, accountId, accountChannelId, {
        concurrencyLimit: 2,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
    expect(repositories.accountChannel.save).not.toHaveBeenCalled()
  })

  it('clears existing payment channel amount limits explicitly', async () => {
    repositories.account.findOne.mockResolvedValue({ id: accountId, tenantId })
    repositories.accountChannel.findOne.mockResolvedValue({
      id: accountChannelId,
      paymentAccountId: accountId,
      minimumAmount: '10.00',
      maximumAmount: '30000.00',
    })

    await service.updateAccountChannel(tenantId, accountId, accountChannelId, {
      minimumAmount: null,
      maximumAmount: null,
    })

    expect(repositories.accountChannel.save).toHaveBeenCalledWith(
      expect.objectContaining({ minimumAmount: null, maximumAmount: null }),
    )
  })

  it('protects a payment account referenced by a payment order from deletion', async () => {
    txRepositories.paymentOrder.exists.mockResolvedValue(true)

    await expect(service.removeAccount(tenantId, accountId)).rejects.toBeInstanceOf(
      ConflictException,
    )
    expect(txRepositories.account.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused channel binding only inside its tenant account', async () => {
    await service.removeAccountChannel(tenantId, accountId, accountChannelId)

    expect(txRepositories.account.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: accountId, tenantId } }),
    )
    expect(txRepositories.accountChannel.delete).toHaveBeenCalledWith({
      id: accountChannelId,
      paymentAccountId: accountId,
    })
  })
})
