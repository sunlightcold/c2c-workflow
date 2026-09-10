import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { PaymentOrderController } from '@/apps/admin/modules/payment/payment-order.controller'
import { PaymentOrderService } from '@/apps/admin/modules/payment/payment-order.service'
import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
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

describe('Payment order API contract (e2e)', () => {
  let app: INestApplication
  const scope = { resolveTenantId: jest.fn().mockReturnValue('tenant-1') }
  const orders = { create: jest.fn(), rematch: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [PaymentOrderController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: PaymentOrderService, useValue: orders },
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('creates a validated manual payment order in the resolved tenant', async () => {
    orders.create.mockResolvedValue({ id: 'order-1', status: 'READY' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-orders')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        merchantId: '00000000-0000-4000-8000-000000000020',
        sourceBusinessNo: 'manual-1',
        amount: '100.00',
        currency: 'CNY',
        paymentMethod: 'ALIPAY',
        executionMode: 'BATCH',
        payeeIdentity: 'payee@example.com',
        payeeName: 'Payee',
      })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(orders.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ sourceType: 'BOT_MANUAL', amount: '100.00' }),
    )
  })

  it('rejects numeric and zero amounts before invoking the service', async () => {
    for (const amount of [100, '0.00']) {
      const response = await request(app.getHttpServer())
        .post('/v1/sys/payment-orders')
        .send({
          tenantId: '00000000-0000-4000-8000-000000000010',
          merchantId: '00000000-0000-4000-8000-000000000020',
          sourceBusinessNo: 'manual-1',
          amount,
          currency: 'CNY',
          paymentMethod: 'ALIPAY',
          executionMode: 'BATCH',
          payeeIdentity: 'payee@example.com',
          payeeName: 'Payee',
        })
        .expect(400)
      expectWrappedError(response.body, 400)
    }
    expect(orders.create).not.toHaveBeenCalled()
  })

  it('rematches a pending-config order in the resolved tenant', async () => {
    orders.rematch.mockResolvedValue({ id: '00000000-0000-4000-8000-000000000030', status: 'READY' })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-orders/00000000-0000-4000-8000-000000000030/rematch')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(orders.rematch).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000030',
    )
  })
})
