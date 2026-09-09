import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { BusinessController } from '@/apps/admin/modules/business/business.controller'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { MerchantService } from '@/apps/admin/modules/business/merchant.service'
import { PaymentConfigService } from '@/apps/admin/modules/business/payment-config.service'
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
  const payments = { createAccount: jest.fn(), openAccountChannel: jest.fn(), createPlan: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [BusinessController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: TenantService, useValue: tenants },
        { provide: MerchantService, useValue: merchants },
        { provide: PaymentConfigService, useValue: payments },
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('creates a merchant with exactly one supported platform', async () => {
    merchants.create.mockResolvedValue({ id: 'merchant-1', platform: 'BINANCE' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010', code: 'm-1', name: 'M1', platform: 'BINANCE' })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(merchants.create).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ platform: 'BINANCE' }))
  })

  it('rejects unsupported merchant platforms before invoking the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010', code: 'm-1', name: 'M1', platform: 'WECHAT' })
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
        scene: 'C2C_BUY', currency: 'CNY', priority: 10, weight: 100,
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(payments.createPlan).toHaveBeenCalledWith('tenant-1', expect.objectContaining({ currency: 'CNY' }))
  })
})
