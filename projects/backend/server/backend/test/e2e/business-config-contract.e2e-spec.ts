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
  const merchants = { create: jest.fn(), list: jest.fn() }
  const payments = {
    createAccount: jest.fn(),
    openAccountChannel: jest.fn(),
    createPlan: jest.fn(),
    listCatalog: jest.fn(),
    listAccounts: jest.fn(),
    listPlans: jest.fn(),
  }
  const credentials = { list: jest.fn(), rotate: jest.fn() }

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
        code: 'm-1',
        name: 'M1',
        platform: 'BINANCE',
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(merchants.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ platform: 'BINANCE' }),
    )
  })

  it('lists the payment catalog, tenant accounts and merchant plans', async () => {
    payments.listCatalog.mockResolvedValue([{ id: 'platform-1', channels: [] }])
    payments.listAccounts.mockResolvedValue([{ id: 'account-1', channels: [] }])
    payments.listPlans.mockResolvedValue([{ id: 'plan-1', merchantId: 'merchant-1' }])

    const catalog = await request(app.getHttpServer()).get('/v1/sys/payment-platforms').expect(200)
    const accounts = await request(app.getHttpServer())
      .get('/v1/sys/payment-accounts')
      .query({ tenantId: '00000000-0000-4000-8000-000000000010' })
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
    expect(payments.listAccounts).toHaveBeenCalledWith('tenant-1')
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
        code: 'm-1',
        name: 'M1',
        platform: 'WECHAT',
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

  it('creates a payment account without returning its Secret reference', async () => {
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
        code: 'alipay-1',
        name: 'Alipay 1',
        externalAccountId: '2088',
        credentialRef: 'env://ALIPAY_ACCOUNT_1',
      })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('credentialRef')
    expect(payments.createAccount).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ credentialRef: 'env://ALIPAY_ACCOUNT_1' }),
    )
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
        credentialRef: 'vault://c2c/binance/merchant-1/v1',
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
