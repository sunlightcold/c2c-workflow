import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelMerchantOrderApi,
  confirmMerchantOrderPaidApi,
  createManualPaymentOrderApi,
  createMerchantOrderPaymentApi,
  createTenantApi,
  deleteMerchantApi,
  filterMerchantsApi,
  getMerchantOrderAppealReasonsApi,
  getPaymentOrdersApi,
  rotateMerchantCredentialApi,
  setMerchantStatusApi,
  submitMerchantOrderAppealApi,
  syncMerchantOrdersApi,
  testMerchantConnectionApi,
  updateMerchantApi,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  request: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('business api', () => {
  beforeEach(() => {
    requestMocks.get.mockReset();
    requestMocks.delete.mockReset();
    requestMocks.post.mockReset();
    requestMocks.put.mockReset();
    requestMocks.request.mockReset();
  });

  it('maps merchant account filters and pagination to the grid contract', async () => {
    requestMocks.get.mockResolvedValue({
      items: [{ id: 'merchant-1', name: '主账号' }],
      page: 2,
      pageSize: 10,
      total: 11,
    });

    const result = await filterMerchantsApi({
      accountCode: 'main',
      page: 2,
      pageSize: 10,
      platform: 'BINANCE',
      tenantId: 'tenant-1',
    });

    expect(requestMocks.get).toHaveBeenCalledWith('/sys/merchants', {
      params: {
        accountCode: 'main',
        page: 2,
        pageSize: 10,
        platform: 'BINANCE',
        tenantId: 'tenant-1',
      },
    });
    expect(result.meta).toEqual({
      currentPage: 2,
      itemsPerPage: 10,
      totalItems: 11,
      totalPages: 2,
    });
  });

  it('creates a tenant without exposing internal timezone configuration', async () => {
    requestMocks.post.mockResolvedValue({ id: 'tenant-1' });

    await createTenantApi({ code: 'agent-one', name: '代理商一' });

    expect(requestMocks.post).toHaveBeenCalledWith('/sys/tenants', {
      code: 'agent-one',
      name: '代理商一',
    });
  });

  it('uses the merchant account CRUD and operational endpoints', async () => {
    requestMocks.put.mockResolvedValue({ id: 'merchant-1' });
    requestMocks.request.mockResolvedValue({ id: 'merchant-1' });
    requestMocks.delete.mockResolvedValue(undefined);
    requestMocks.post.mockResolvedValue({ success: true });

    await updateMerchantApi('merchant-1', {
      name: '新名称',
      tenantId: 'tenant-1',
    });
    await setMerchantStatusApi('merchant-1', 'disabled', 'tenant-1');
    await deleteMerchantApi('merchant-1', 'tenant-1');
    await testMerchantConnectionApi('merchant-1', 'tenant-1');
    await syncMerchantOrdersApi('merchant-1', { tenantId: 'tenant-1' });

    expect(requestMocks.put).toHaveBeenCalledWith('/sys/merchants/merchant-1', {
      name: '新名称',
      tenantId: 'tenant-1',
    });
    expect(requestMocks.request).toHaveBeenCalledWith(
      '/sys/merchants/merchant-1/status',
      {
        data: { status: 'disabled' },
        method: 'PATCH',
        params: { tenantId: 'tenant-1' },
      },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/sys/merchants/merchant-1',
      { params: { tenantId: 'tenant-1' } },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/sys/merchants/merchant-1/test',
      undefined,
      { params: { tenantId: 'tenant-1' } },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/sys/merchants/merchant-1/orders/sync',
      undefined,
      { params: { tenantId: 'tenant-1' } },
    );
  });

  it('sends platform secrets only when rotating credentials', async () => {
    requestMocks.post.mockResolvedValue({ id: 'credential-2' });

    await rotateMerchantCredentialApi('merchant-1', {
      apiKey: 'api-key',
      requestTimeoutMs: 15_000,
      secretKey: 'secret-key',
      tenantId: 'tenant-1',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/sys/merchants/merchant-1/platform-credentials',
      {
        apiKey: 'api-key',
        requestTimeoutMs: 15_000,
        secretKey: 'secret-key',
        tenantId: 'tenant-1',
      },
    );
  });

  it('maps payment order pagination to the grid contract', async () => {
    requestMocks.get.mockResolvedValue({
      items: [{ amount: '88.00', id: 'order-1' }],
      page: 2,
      pageSize: 20,
      total: 21,
    });

    const result = await getPaymentOrdersApi({ page: 2, pageSize: 20 });

    expect(requestMocks.get).toHaveBeenCalledWith('/sys/payment-orders', {
      params: { page: 2, pageSize: 20 },
    });
    expect(result).toEqual({
      items: [{ amount: '88.00', id: 'order-1' }],
      meta: {
        currentPage: 2,
        itemsPerPage: 20,
        totalItems: 21,
        totalPages: 2,
      },
    });
  });

  it('keeps payment amounts as strings when creating a manual order', async () => {
    requestMocks.post.mockResolvedValue({ id: 'order-1' });

    await createManualPaymentOrderApi({
      amount: '100.00',
      currency: 'CNY',
      executionMode: 'BATCH',
      merchantId: '00000000-0000-4000-8000-000000000020',
      payeeIdentity: 'payee@example.com',
      payeeName: '收款人',
      paymentMethod: 'ALIPAY',
      sourceBusinessNo: 'manual-1',
    });

    expect(requestMocks.post).toHaveBeenCalledWith('/sys/payment-orders', {
      amount: '100.00',
      currency: 'CNY',
      executionMode: 'BATCH',
      merchantId: '00000000-0000-4000-8000-000000000020',
      payeeIdentity: 'payee@example.com',
      payeeName: '收款人',
      paymentMethod: 'ALIPAY',
      sourceBusinessNo: 'manual-1',
    });
  });

  it('uses the merchant order payment workflow endpoints', async () => {
    requestMocks.post.mockResolvedValue({ id: 'payment-1' });

    await createMerchantOrderPaymentApi('order-1', {
      executionMode: 'INSTANT',
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
    });
    await confirmMerchantOrderPaidApi('order-1', {
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
    });
    await cancelMerchantOrderApi('order-1', {
      merchantId: 'merchant-1',
      reason: '收款资料有误',
      tenantId: 'tenant-1',
    });

    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/sys/merchant-orders/order-1/payment',
      {
        executionMode: 'INSTANT',
        merchantId: 'merchant-1',
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/sys/merchant-orders/order-1/confirm-paid',
      { merchantId: 'merchant-1', tenantId: 'tenant-1' },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/sys/merchant-orders/order-1/cancel',
      {
        merchantId: 'merchant-1',
        reason: '收款资料有误',
        tenantId: 'tenant-1',
      },
    );
  });

  it('loads live appeal reasons and uploads one receipt as multipart data', async () => {
    requestMocks.get.mockResolvedValue({ orderNo: 'BIN-1', reasons: [] });
    requestMocks.post.mockResolvedValue({ complaintNo: '30006788' });
    const receipt = new File(['receipt'], 'receipt.png', {
      type: 'image/png',
    });

    await getMerchantOrderAppealReasonsApi('order-1', {
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
    });
    await submitMerchantOrderAppealApi('order-1', {
      description: '我已付款给卖家，卖家未放行',
      merchantId: 'merchant-1',
      reasonCode: 6,
      receipt,
      tenantId: 'tenant-1',
    });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/sys/merchant-orders/order-1/appeal-reasons',
      { params: { merchantId: 'merchant-1', tenantId: 'tenant-1' } },
    );
    const [url, body] = requestMocks.post.mock.calls.at(0) ?? [];
    expect(url).toBe('/sys/merchant-orders/order-1/appeal');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('merchantId')).toBe('merchant-1');
    expect(body.get('tenantId')).toBe('tenant-1');
    expect(body.get('reasonCode')).toBe('6');
    expect(body.get('description')).toBe('我已付款给卖家，卖家未放行');
    expect(body.get('receipt')).toBe(receipt);
  });
});
