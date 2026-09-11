import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { BusinessController } from '@/apps/admin/modules/business/business.controller'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { MerchantService } from '@/apps/admin/modules/business/merchant.service'
import { PaymentConfigService } from '@/apps/admin/modules/business/payment-config.service'
import { MerchantPlatformCredentialService } from '@/apps/admin/modules/business/merchant-platform-credential.service'
import { TenantService } from '@/apps/admin/modules/business/tenant.service'
import {
  createAdminContractTestApp,
  expectWrappedError,
  expectWrappedSuccess,
} from './helpers/admin-contract-test-app'

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  User: () => () => undefined,
  definePermission: (prefix: string, actions: string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

describe('Business configuration API contract (e2e)', () => {
  let app: INestApplication
  const scope = { resolveTenantId: jest.fn().mockReturnValue('tenant-1') }
  const tenants = { create: jest.fn(), list: jest.fn() }
  const merchants = {
    create: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
    setStatus: jest.fn(),
    remove: jest.fn(),
  }
  const payments = {
    createAccount: jest.fn(),
    updateAccount: jest.fn(),
    updateAccountCredential: jest.fn(),
    setAccountStatus: jest.fn(),
    removeAccount: jest.fn(),
    openAccountChannel: jest.fn(),
    updateAccountChannel: jest.fn(),
    setAccountChannelStatus: jest.fn(),
    removeAccountChannel: jest.fn(),
    createPlan: jest.fn(),
    updatePlan: jest.fn(),
    setPlanStatus: jest.fn(),
    removePlan: jest.fn(),
    listCatalog: jest.fn(),
    listAccounts: jest.fn(),
    listPlans: jest.fn(),
  }
  const credentials = { list: jest.fn(), rotate: jest.fn(), testConnection: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [BusinessController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: TenantService, useValue: tenants },
        { provide: MerchantService, useValue: merchants },
        { provide: PaymentConfigService, useValue: payments },
        { provide: MerchantPlatformCredentialService, useValue: credentials },
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('creates a merchant with exactly one supported platform', async () => {
    merchants.create.mockResolvedValue({ id: 'merchant-1', platform: 'BINANCE' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        name: 'M1',
        platform: 'BINANCE',
        externalMerchantId: 'binance-merchant-1',
        authMode: 'API_KEY',
        apiKey: 'binance-api-key',
        secretKey: 'binance-secret-key',
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(merchants.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ platform: 'BINANCE' }),
    )
  })

  it('filters, edits, disables, tests and deletes merchant accounts in the resolved tenant', async () => {
    merchants.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    merchants.update.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000020' })
    merchants.setStatus.mockResolvedValue({ status: 'disabled' })
    merchants.remove.mockResolvedValue(undefined)
    credentials.testConnection.mockResolvedValue({ success: true, platform: 'BINANCE' })
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const merchantId = '00000000-0000-4000-8000-000000000020'

    await request(app.getHttpServer())
      .get('/v1/sys/merchants')
      .query({ tenantId, accountName: 'main', page: 1, pageSize: 20 })
      .expect(200)
    await request(app.getHttpServer())
      .put(`/v1/sys/merchants/${merchantId}`)
      .send({
        tenantId,
        name: 'Main Account',
        overlapSeconds: 180,
        telegramGroupId: '00000000-0000-4000-8000-000000000030',
      })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/v1/sys/merchants/${merchantId}/status`)
      .query({ tenantId })
      .send({ status: 'disabled' })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/sys/merchants/${merchantId}/test`)
      .query({ tenantId })
      .expect(201)
    await request(app.getHttpServer())
      .delete(`/v1/sys/merchants/${merchantId}`)
      .query({ tenantId })
      .expect(200)

    expect(merchants.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ accountName: 'main', page: 1, pageSize: 20 }),
    )
    expect(merchants.update).toHaveBeenCalledWith(
      'tenant-1',
      merchantId,
      expect.objectContaining({
        name: 'Main Account',
        overlapSeconds: 180,
        telegramGroupId: '00000000-0000-4000-8000-000000000030',
      }),
    )
    expect(merchants.setStatus).toHaveBeenCalledWith('tenant-1', merchantId, 'disabled')
    expect(credentials.testConnection).toHaveBeenCalledWith('tenant-1', merchantId)
    expect(merchants.remove).toHaveBeenCalledWith('tenant-1', merchantId)
  })

  it('does not pass raw bot and Telegram chat identifiers to merchant updates', async () => {
    await request(app.getHttpServer())
      .put('/v1/sys/merchants/00000000-0000-4000-8000-000000000020')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        botCode: 'PAYMENT_MAIN',
        chatId: '-1001234567890',
      })
      .expect(200)

    expect(merchants.update).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
      {},
    )
  })

  it('lists the payment catalog, tenant accounts and merchant plans', async () => {
    payments.listCatalog.mockResolvedValue([{ id: 'platform-1', channels: [] }])
    payments.listAccounts.mockResolvedValue({
      items: [{ id: 'account-1', channels: [] }],
      page: 2,
      pageSize: 10,
      total: 1,
    })
    payments.listPlans.mockResolvedValue([{ id: 'plan-1', merchantId: 'merchant-1' }])

    const catalog = await request(app.getHttpServer()).get('/v1/sys/payment-platforms').expect(200)
    const accounts = await request(app.getHttpServer())
      .get('/v1/sys/payment-accounts')
      .query({
        tenantId: '00000000-0000-4000-8000-000000000010',
        accountName: 'main',
        accountCode: 'alipay',
        externalAccountId: '2088',
        platformId: '00000000-0000-4000-8000-000000000011',
        status: 'active',
        page: 2,
        pageSize: 10,
      })
      .expect(200)
    const plans = await request(app.getHttpServer())
      .get('/v1/sys/payment-plans')
      .query({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
      })
      .expect(200)

    expectWrappedSuccess(catalog.body)
    expectWrappedSuccess(accounts.body)
    expectWrappedSuccess(plans.body)
    expect(payments.listCatalog).toHaveBeenCalled()
    expect(payments.listAccounts).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        accountName: 'main',
        accountCode: 'alipay',
        externalAccountId: '2088',
        platformId: '00000000-0000-4000-8000-000000000011',
        status: 'active',
        page: 2,
        pageSize: 10,
      }),
    )
    expect(payments.listPlans).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
    )
  })

  it('rejects unsupported merchant platforms before invoking the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        name: 'M1',
        platform: 'WECHAT',
        externalMerchantId: 'merchant-1',
        authMode: 'API_KEY',
        apiKey: 'api-key-value',
        secretKey: 'secret-key-value',
      })
      .expect(400)
    expectWrappedError(response.body, 400)
    expect(merchants.create).not.toHaveBeenCalled()
  })

  it('validates a payment plan as an account and account-channel pair', async () => {
    payments.createPlan.mockResolvedValue({ id: 'plan-1' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-plans')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
        paymentAccountId: '00000000-0000-4000-8000-000000000030',
        paymentAccountChannelId: '00000000-0000-4000-8000-000000000040',
        scene: 'C2C_BUY',
        currency: 'CNY',
        priority: 10,
        weight: 100,
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(payments.createPlan).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ currency: 'CNY' }),
    )
  })

  it('edits, disables and deletes a payment plan in the resolved tenant', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const planId = '00000000-0000-4000-8000-000000000050'
    payments.updatePlan.mockResolvedValue({ id: planId, priority: 20, weight: 60 })
    payments.setPlanStatus.mockResolvedValue({ id: planId, status: 'disabled' })
    payments.removePlan.mockResolvedValue(undefined)

    await request(app.getHttpServer())
      .put(`/v1/sys/payment-plans/${planId}`)
      .send({ tenantId, priority: 20, weight: 60 })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/v1/sys/payment-plans/${planId}/status`)
      .query({ tenantId })
      .send({ status: 'disabled' })
      .expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/sys/payment-plans/${planId}`)
      .query({ tenantId })
      .expect(200)

    expect(payments.updatePlan).toHaveBeenCalledWith(
      'tenant-1',
      planId,
      expect.objectContaining({ priority: 20, weight: 60 }),
    )
    expect(payments.setPlanStatus).toHaveBeenCalledWith('tenant-1', planId, 'disabled')
    expect(payments.removePlan).toHaveBeenCalledWith('tenant-1', planId)
  })

  it('creates a payment account with one write-only Alipay credential', async () => {
    payments.createAccount.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000030',
      code: 'alipay-1',
      name: 'Alipay 1',
    })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-accounts')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        platformId: '00000000-0000-4000-8000-000000000011',
        name: 'Alipay 1',
        externalAccountId: '2088',
        credential: {
          authMode: 'KEY',
          appId: '2026000000000001',
          gateway: 'https://payments.example.com/alipay/gateway.do',
          privateKey: 'application-private-key',
          alipayPublicKey: 'alipay-public-key',
        },
      })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('credentialRef')
    expect(payments.createAccount).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        credential: expect.objectContaining({
          authMode: 'KEY',
          gateway: 'https://payments.example.com/alipay/gateway.do',
        }),
      }),
    )
  })

  it('rejects a payment account gateway outside HTTP protocols', async () => {
    await request(app.getHttpServer())
      .post('/v1/sys/payment-accounts')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        platformId: '00000000-0000-4000-8000-000000000011',
        name: 'Alipay 1',
        externalAccountId: '2088',
        credential: {
          authMode: 'KEY',
          appId: '2026000000000001',
          gateway: 'file:///etc/passwd',
          privateKey: 'application-private-key',
          alipayPublicKey: 'alipay-public-key',
        },
      })
      .expect(400)

    expect(payments.createAccount).not.toHaveBeenCalled()
  })

  it('replaces the single payment account credential through a dedicated endpoint', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const accountId = '00000000-0000-4000-8000-000000000030'
    payments.updateAccountCredential.mockResolvedValue({
      id: accountId,
      credentialAuthMode: 'CERT',
      credentialConfigured: true,
    })

    const response = await request(app.getHttpServer())
      .put(`/v1/sys/payment-accounts/${accountId}/credential`)
      .send({
        tenantId,
        authMode: 'CERT',
        appId: '2026000000000001',
        gateway: 'https://openapi.alipay.com/gateway.do',
        privateKey: 'application-private-key',
        appCertContent: 'application-certificate',
        alipayPublicCertContent: 'alipay-public-certificate',
        alipayRootCertContent: 'alipay-root-certificate',
      })
      .expect(200)

    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('privateKey')
    expect(payments.updateAccountCredential).toHaveBeenCalledWith(
      'tenant-1',
      accountId,
      expect.objectContaining({ authMode: 'CERT' }),
    )
  })

  it('edits, disables and deletes payment accounts and their channel bindings in the tenant', async () => {
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const accountId = '00000000-0000-4000-8000-000000000030'
    const bindingId = '00000000-0000-4000-8000-000000000040'
    payments.updateAccount.mockResolvedValue({ id: accountId, name: '主支付账号' })
    payments.setAccountStatus.mockResolvedValue({ id: accountId, status: 'disabled' })
    payments.removeAccount.mockResolvedValue(undefined)
    payments.openAccountChannel.mockResolvedValue({ id: bindingId })
    payments.updateAccountChannel.mockResolvedValue({ id: bindingId, concurrencyLimit: 5 })
    payments.setAccountChannelStatus.mockResolvedValue({ id: bindingId, status: 'disabled' })
    payments.removeAccountChannel.mockResolvedValue(undefined)

    await request(app.getHttpServer())
      .put(`/v1/sys/payment-accounts/${accountId}`)
      .send({
        tenantId,
        name: '主支付账号',
        externalAccountId: '20881234',
      })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/v1/sys/payment-accounts/${accountId}/status`)
      .query({ tenantId })
      .send({ status: 'disabled' })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/sys/payment-accounts/${accountId}/channels`)
      .send({
        tenantId,
        channelId: '00000000-0000-4000-8000-000000000050',
        minimumAmount: '1.00',
        maximumAmount: '50000.00',
        concurrencyLimit: 5,
      })
      .expect(201)
    await request(app.getHttpServer())
      .put(`/v1/sys/payment-accounts/${accountId}/channels/${bindingId}`)
      .send({
        tenantId,
        minimumAmount: null,
        maximumAmount: null,
        concurrencyLimit: 3,
      })
      .expect(200)
    await request(app.getHttpServer())
      .patch(`/v1/sys/payment-accounts/${accountId}/channels/${bindingId}/status`)
      .query({ tenantId })
      .send({ status: 'disabled' })
      .expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/sys/payment-accounts/${accountId}/channels/${bindingId}`)
      .query({ tenantId })
      .expect(200)
    await request(app.getHttpServer())
      .delete(`/v1/sys/payment-accounts/${accountId}`)
      .query({ tenantId })
      .expect(200)

    expect(payments.updateAccount).toHaveBeenCalledWith(
      'tenant-1',
      accountId,
      expect.objectContaining({ name: '主支付账号' }),
    )
    expect(payments.setAccountStatus).toHaveBeenCalledWith('tenant-1', accountId, 'disabled')
    expect(payments.openAccountChannel).toHaveBeenCalledWith(
      'tenant-1',
      accountId,
      expect.objectContaining({ concurrencyLimit: 5, minimumAmount: '1.00' }),
    )
    expect(payments.updateAccountChannel).toHaveBeenCalledWith(
      'tenant-1',
      accountId,
      bindingId,
      expect.objectContaining({
        concurrencyLimit: 3,
        minimumAmount: null,
        maximumAmount: null,
      }),
    )
    expect(payments.setAccountChannelStatus).toHaveBeenCalledWith(
      'tenant-1',
      accountId,
      bindingId,
      'disabled',
    )
    expect(payments.removeAccountChannel).toHaveBeenCalledWith('tenant-1', accountId, bindingId)
    expect(payments.removeAccount).toHaveBeenCalledWith('tenant-1', accountId)
  })

  it.each([
    { minimumAmount: '-1.00', maximumAmount: '10.00', concurrencyLimit: 1 },
    { minimumAmount: '1.001', maximumAmount: '10.00', concurrencyLimit: 1 },
    { minimumAmount: '1.00', maximumAmount: '10.00', concurrencyLimit: 0 },
  ])('rejects invalid payment channel limits: %j', async (limits) => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-accounts/00000000-0000-4000-8000-000000000030/channels')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        channelId: '00000000-0000-4000-8000-000000000050',
        ...limits,
      })
      .expect(400)
    expectWrappedError(response.body, 400)
    expect(payments.openAccountChannel).not.toHaveBeenCalled()
  })

  it('rotates merchant platform credentials without returning a secret reference', async () => {
    credentials.rotate.mockResolvedValue({
      id: 'credential-1',
      version: 1,
      platform: 'BINANCE',
      credentialConfigured: true,
    })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants/00000000-0000-4000-8000-000000000020/platform-credentials')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        apiKey: 'binance-api-key',
        secretKey: 'binance-secret-key',
        clientType: 'WEB',
        requestTimeoutMs: 5000,
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('credentialRef')
    expect(credentials.rotate).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
      expect.objectContaining({ clientType: 'WEB' }),
    )
  })
})
