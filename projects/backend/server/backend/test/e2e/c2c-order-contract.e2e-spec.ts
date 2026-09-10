import { C2cOrderController } from '@/apps/admin/modules/c2c-order/c2c-order.controller'
import { C2cOrderService } from '@/apps/admin/modules/c2c-order/c2c-order.service'
import { C2cOrderSyncService } from '@/apps/admin/modules/c2c-order/c2c-order-sync.service'
import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
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

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [C2cOrderController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: C2cOrderService, useValue: orders },
        { provide: C2cOrderSyncService, useValue: sync },
      ],
    })
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
    expect(sync.sync).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000020',
    )
  })
})
