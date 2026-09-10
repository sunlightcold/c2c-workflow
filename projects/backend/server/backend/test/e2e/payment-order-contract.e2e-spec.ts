import { BusinessScopeService } from '@/apps/admin/modules/business/business-scope.service'
import { PaymentOrderController } from '@/apps/admin/modules/payment/payment-order.controller'
import { PaymentOrderService } from '@/apps/admin/modules/payment/payment-order.service'
import { PaymentExecutionCoordinator } from '@/apps/admin/modules/payment/payment-execution-coordinator'
import { PaymentBatchController } from '@/apps/admin/modules/payment/payment-batch.controller'
import { PaymentBatchService } from '@/apps/admin/modules/payment/payment-batch.service'
import { PaymentBatchExecutionCoordinator } from '@/apps/admin/modules/payment/payment-batch-execution-coordinator'
import { ConflictException, type INestApplication } from '@nestjs/common'
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
  const orders = { create: jest.fn(), rematch: jest.fn(), list: jest.fn(), detail: jest.fn() }
  const execution = { reconcile: jest.fn() }
  const batches = { create: jest.fn(), list: jest.fn(), detail: jest.fn() }
  const batchExecution = { submit: jest.fn(), reconcile: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [PaymentOrderController, PaymentBatchController],
      path: 'sys',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: PaymentOrderService, useValue: orders },
        { provide: PaymentExecutionCoordinator, useValue: execution },
        { provide: PaymentBatchService, useValue: batches },
        { provide: PaymentBatchExecutionCoordinator, useValue: batchExecution },
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

  it('lists and reads payment orders in the resolved tenant', async () => {
    const orderId = '00000000-0000-4000-8000-000000000030'
    orders.list.mockResolvedValue({ items: [{ id: orderId }], total: 1, page: 1, pageSize: 20 })
    orders.detail.mockResolvedValue({ id: orderId, history: [] })

    const listed = await request(app.getHttpServer())
      .get('/v1/sys/payment-orders')
      .query({ status: 'READY', page: 1, pageSize: 20 })
      .expect(200)
    const detail = await request(app.getHttpServer())
      .get(`/v1/sys/payment-orders/${orderId}`)
      .expect(200)

    expectWrappedSuccess(listed.body)
    expectWrappedSuccess(detail.body)
    expect(orders.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'READY', page: 1, pageSize: 20 }),
    )
    expect(orders.detail).toHaveBeenCalledWith('tenant-1', orderId)
  })

  it('rejects unsupported payment order status filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/sys/payment-orders')
      .query({ status: 'NOT_A_STATUS', page: 1, pageSize: 20 })
      .expect(400)

    expectWrappedError(response.body, 400)
    expect(orders.list).not.toHaveBeenCalled()
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
    orders.rematch.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000030',
      status: 'READY',
    })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-orders/00000000-0000-4000-8000-000000000030/rematch')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(orders.rematch).toHaveBeenCalledWith('tenant-1', '00000000-0000-4000-8000-000000000030')
  })

  it('reconciles a processing payment in the resolved tenant without resubmitting it', async () => {
    execution.reconcile.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000030',
      status: 'PROCESSING',
    })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-orders/00000000-0000-4000-8000-000000000030/reconcile')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(execution.reconcile).toHaveBeenCalledWith(
      'tenant-1',
      '00000000-0000-4000-8000-000000000030',
    )
  })

  it('returns conflict when a payment cannot be reconciled in its current state', async () => {
    execution.reconcile.mockRejectedValue(
      new ConflictException('只有处理中或结果未知的支付订单可以回查'),
    )

    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-orders/00000000-0000-4000-8000-000000000030/reconcile')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(409)

    expectWrappedError(response.body, 409)
  })

  it('creates a payment batch in the resolved tenant', async () => {
    const paymentOrderIds = [
      '00000000-0000-4000-8000-000000000031',
      '00000000-0000-4000-8000-000000000032',
    ]
    batches.create.mockResolvedValue({ batch: { id: 'batch-1', status: 'READY' }, items: [] })

    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-batches')
      .send({ tenantId: '00000000-0000-4000-8000-000000000010', paymentOrderIds })
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(batches.create).toHaveBeenCalledWith('tenant-1', paymentOrderIds)
  })

  it('lists and reads payment batches in the resolved tenant', async () => {
    const batchId = '00000000-0000-4000-8000-000000000041'
    batches.list.mockResolvedValue({ items: [{ id: batchId }], total: 1, page: 1, pageSize: 20 })
    batches.detail.mockResolvedValue({ batch: { id: batchId }, items: [] })

    const listed = await request(app.getHttpServer())
      .get('/v1/sys/payment-batches')
      .query({ status: 'PROCESSING', page: 1, pageSize: 20 })
      .expect(200)
    const detail = await request(app.getHttpServer())
      .get(`/v1/sys/payment-batches/${batchId}`)
      .expect(200)

    expectWrappedSuccess(listed.body)
    expectWrappedSuccess(detail.body)
    expect(batches.list).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ status: 'PROCESSING', page: 1, pageSize: 20 }),
    )
    expect(batches.detail).toHaveBeenCalledWith('tenant-1', batchId)
  })

  it('rejects duplicate payment orders before creating a batch', async () => {
    const paymentOrderId = '00000000-0000-4000-8000-000000000031'
    const response = await request(app.getHttpServer())
      .post('/v1/sys/payment-batches')
      .send({ paymentOrderIds: [paymentOrderId, paymentOrderId] })
      .expect(400)

    expectWrappedError(response.body, 400)
    expect(batches.create).not.toHaveBeenCalled()
  })

  it('submits and reconciles a payment batch in the resolved tenant', async () => {
    const batchId = '00000000-0000-4000-8000-000000000041'
    batchExecution.submit.mockResolvedValue({ id: batchId, status: 'PROCESSING' })
    batchExecution.reconcile.mockResolvedValue({ id: batchId, status: 'SUCCESS' })

    const submitted = await request(app.getHttpServer())
      .post(`/v1/sys/payment-batches/${batchId}/submit`)
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)
    const reconciled = await request(app.getHttpServer())
      .post(`/v1/sys/payment-batches/${batchId}/reconcile`)
      .send({ tenantId: '00000000-0000-4000-8000-000000000010' })
      .expect(201)

    expectWrappedSuccess(submitted.body)
    expectWrappedSuccess(reconciled.body)
    expect(batchExecution.submit).toHaveBeenCalledWith('tenant-1', batchId)
    expect(batchExecution.reconcile).toHaveBeenCalledWith('tenant-1', batchId)
  })
})
