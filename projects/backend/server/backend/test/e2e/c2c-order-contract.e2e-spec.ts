import { C2cOrderController } from '@/apps/admin/modules/c2c-order/c2c-order.controller'
import { C2cOrderService } from '@/apps/admin/modules/c2c-order/c2c-order.service'
import { C2cOrderSyncService } from '@/apps/admin/modules/c2c-order/c2c-order-sync.service'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { C2cMerchantPaymentController } from '@/apps/admin/modules/payment/c2c-merchant-payment.controller'
import { C2cMerchantPaymentService } from '@/apps/admin/modules/payment/c2c-merchant-payment.service'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { createAdminContractTestApp, expectWrappedSuccess } from './helpers/admin-contract-test-app'

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  User: () => () => undefined,
  definePermission: (prefix: string, actions: string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

describe('C2C merchant order API contract (e2e)', () => {
  let app: INestApplication
  const scope = { resolveTenantId: jest.fn().mockReturnValue('tenant-1') }
  const orders = { list: jest.fn(), detail: jest.fn() }
  const sync = { sync: jest.fn() }
  const payment = { cancel: jest.fn(), confirmPaid: jest.fn(), create: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [C2cOrderController, C2cMerchantPaymentController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: C2cOrderService, useValue: orders },
        { provide: C2cOrderSyncService, useValue: sync },
        { provide: C2cMerchantPaymentService, useValue: payment },
      ],
    })
  })

  it('creates a payment from a scoped merchant order without accepting payee fields', async () => {
    payment.create.mockResolvedValue({ id: 'payment-1', status: 'READY' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchant-orders/00000000-0000-4000-8000-000000000030/payment')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
        executionMode: 'BATCH',
      })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(payment.create).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000030',
      'BATCH',
    )
  })

  it('retries platform paid confirmation through the merchant order', async () => {
    payment.confirmPaid.mockResolvedValue({ id: 'payment-1', status: 'COMPLETED' })

    await request(app.getHttpServer())
      .post('/v1/sys/merchant-orders/00000000-0000-4000-8000-000000000030/confirm-paid')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
      })
      .expect(201)

    expect(payment.confirmPaid).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000030',
    )
  })

  it('cancels an unsubmitted merchant payment with an audit reason', async () => {
    payment.cancel.mockResolvedValue({ id: 'order-1', status: 'CANCELLED' })

    await request(app.getHttpServer())
      .post('/v1/sys/merchant-orders/00000000-0000-4000-8000-000000000030/cancel')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
        reason: '收款资料有误',
      })
      .expect(201)

    expect(payment.cancel).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000030',
      expect.any(String),
      '收款资料有误',
    )
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('lists one merchant buy-order scope with bounded pagination', async () => {
    orders.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 })
    const response = await request(app.getHttpServer())
      .get('/v1/sys/merchant-orders')
      .query({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
        page: 1,
        pageSize: 20,
      })
      .expect(200)
    expectWrappedSuccess(response.body)
    expect(orders.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        merchantId: '00000000-0000-4000-8000-000000000020',
        page: 1,
        pageSize: 20,
      }),
    )
  })

  it('runs synchronization only for the merchant in the resolved tenant', async () => {
    sync.sync.mockResolvedValue({ scanned: 1, created: 1, updated: 0 })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchants/00000000-0000-4000-8000-000000000020/orders/sync')
      .query({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(sync.sync).toHaveBeenCalledWith('tenant-1', '00000000-0000-4000-8000-000000000020')
  })
})
