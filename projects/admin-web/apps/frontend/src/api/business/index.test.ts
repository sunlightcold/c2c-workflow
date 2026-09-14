import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  approveTelegramGroupApi,
  cancelMerchantOrderApi,
  checkTelegramBotRuntimeApi,
  confirmMerchantOrderPaidApi,
  createManualPaymentOrderApi,
  createMerchantOrderPaymentApi,
  createPaymentBatchPolicyApi,
  createTelegramBotApi,
  createTelegramGroupApi,
  createTelegramMemberApi,
  createTelegramSuperAdminApi,
  createTenantApi,
  deleteMerchantApi,
  deletePaymentAccountApi,
  deletePaymentAccountChannelApi,
  deleteTelegramBotApi,
  deleteTelegramMemberApi,
  deleteTelegramSuperAdminApi,
  filterMerchantsApi,
  filterPaymentAccountsApi,
  getMerchantOrderAppealReasonsApi,
  getMerchantOrdersApi,
  getPaymentBatchPoliciesApi,
  getPaymentOrdersApi,
  restartTelegramBotRuntimeApi,
  rotateMerchantCredentialApi,
  setMerchantStatusApi,
  setPaymentAccountChannelStatusApi,
  setPaymentAccountStatusApi,
  setTelegramBotStatusApi,
  setTelegramMemberStatusApi,
  setTelegramSuperAdminStatusApi,
  startTelegramBotRuntimeApi,
  stopTelegramBotRuntimeApi,
  submitMerchantOrderAppealApi,
  submitPaymentBatchPolicyApi,
  syncMerchantOrdersApi,
  testMerchantConnectionApi,
  unbindTelegramGroupApi,
  updateMerchantApi,
  updatePaymentAccountApi,
  updatePaymentAccountChannelApi,
  updateTelegramBotApi,
  updateTelegramGroupApi,
  updateTelegramMemberApi,
  updateTelegramSuperAdminApi,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
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
    requestMocks.patch.mockReset();
    requestMocks.put.mockReset();
    requestMocks.request.mockReset();
  });

  it('omits an empty merchant filter when listing merchant orders', async () => {
    requestMocks.get.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await getMerchantOrdersApi({
      merchantId: '',
      page: 1,
      pageSize: 20,
      tenantId: 'tenant-1',
    });

    expect(requestMocks.get).toHaveBeenCalledWith('/sys/merchant-orders', {
      params: {
        page: 1,
        pageSize: 20,
        tenantId: 'tenant-1',
      },
    });
  });

  it('uses tenant-scoped batch policy endpoints and preserves parallel rules', async () => {
    requestMocks.get.mockResolvedValue({
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
    });

    await getPaymentBatchPoliciesApi({
      merchantId: 'merchant-1',
      page: 1,
      pageSize: 20,
      tenantId: 'tenant-1',
    });
    await createPaymentBatchPolicyApi({
      merchantId: 'merchant-1',
      name: '主批次策略',
      rules: [
        { ruleType: 'INTERVAL', status: 'active', intervalSeconds: 60 },
        { ruleType: 'ORDER_COUNT', status: 'active', orderCount: 10 },
      ],
      scopeType: 'MERCHANT',
      tenantId: 'tenant-1',
    });
    await submitPaymentBatchPolicyApi('policy-1', { tenantId: 'tenant-1' });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/sys/payment-batch-policies',
      {
        params: {
          merchantId: 'merchant-1',
          page: 1,
          pageSize: 20,
          tenantId: 'tenant-1',
        },
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      1,
      '/sys/payment-batch-policies',
      expect.objectContaining({ rules: expect.any(Array) }),
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/sys/payment-batch-policies/policy-1/submit',
      { tenantId: 'tenant-1' },
    );
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

    await createTenantApi({ name: '代理商一' });

    expect(requestMocks.post).toHaveBeenCalledWith('/sys/tenants', {
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

  it('maps payment account filters and pagination to the grid contract', async () => {
    requestMocks.get.mockResolvedValue({
      items: [{ id: 'account-1', name: '主支付账号' }],
      page: 2,
      pageSize: 10,
      total: 12,
    });

    const result = await filterPaymentAccountsApi({
      accountName: '主账号',
      page: 2,
      pageSize: 10,
      platformId: 'platform-1',
      status: 'active',
      tenantId: 'tenant-1',
    });

    expect(requestMocks.get).toHaveBeenCalledWith('/sys/payment-accounts', {
      params: {
        accountName: '主账号',
        page: 2,
        pageSize: 10,
        platformId: 'platform-1',
        status: 'active',
        tenantId: 'tenant-1',
      },
    });
    expect(result.meta).toEqual({
      currentPage: 2,
      itemsPerPage: 10,
      totalItems: 12,
      totalPages: 2,
    });
  });

  it('uses payment account and channel management endpoints', async () => {
    requestMocks.put.mockResolvedValue({ id: 'account-1' });
    requestMocks.request.mockResolvedValue({ id: 'account-1' });
    requestMocks.delete.mockResolvedValue(undefined);

    await updatePaymentAccountApi('account-1', {
      credential: {
        appId: '2026000000000001',
        authMode: 'KEY',
        gateway: 'https://openapi.alipay.com/gateway.do',
      },
      externalAccountId: '2088123456789000',
      name: '主支付账号',
      tenantId: 'tenant-1',
    });
    await setPaymentAccountStatusApi('account-1', 'disabled', 'tenant-1');
    await deletePaymentAccountApi('account-1', 'tenant-1');
    await updatePaymentAccountChannelApi('account-1', 'binding-1', {
      maximumAmount: null,
      minimumAmount: null,
      tenantId: 'tenant-1',
    });
    await setPaymentAccountChannelStatusApi(
      'account-1',
      'binding-1',
      'disabled',
      'tenant-1',
    );
    await deletePaymentAccountChannelApi('account-1', 'binding-1', 'tenant-1');

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/sys/payment-accounts/account-1',
      {
        credential: {
          appId: '2026000000000001',
          authMode: 'KEY',
          gateway: 'https://openapi.alipay.com/gateway.do',
        },
        externalAccountId: '2088123456789000',
        name: '主支付账号',
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.request).toHaveBeenNthCalledWith(
      1,
      '/sys/payment-accounts/account-1/status',
      {
        data: { status: 'disabled' },
        method: 'PATCH',
        params: { tenantId: 'tenant-1' },
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/sys/payment-accounts/account-1/channels/binding-1',
      {
        maximumAmount: null,
        minimumAmount: null,
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/sys/payment-accounts/account-1/channels/binding-1',
      { params: { tenantId: 'tenant-1' } },
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

  it('uses the Telegram bot and group management endpoints', async () => {
    requestMocks.post.mockResolvedValue({ id: 'resource-1' });
    requestMocks.put.mockResolvedValue({ id: 'resource-1' });
    requestMocks.request.mockResolvedValue({ id: 'resource-1' });
    requestMocks.delete.mockResolvedValue(undefined);

    await createTelegramBotApi({
      botType: 'PAYMENT',
      capabilities: ['MANUAL_PAYMENT'],
      name: '支付机器人',
      tenantId: 'tenant-1',
      token: '1234567890:AAabcdefghijklmnopQRST_uvwx',
    });
    await updateTelegramBotApi('bot-1', {
      name: '支付机器人一号',
      tenantId: 'tenant-1',
    });
    await setTelegramBotStatusApi('bot-1', 'disabled', 'tenant-1');
    await deleteTelegramBotApi('bot-1', 'tenant-1');
    await createTelegramGroupApi({
      botId: 'bot-1',
      capabilities: ['MANUAL_PAYMENT'],
      merchantId: 'merchant-1',
      name: '支付一群',
      paymentScene: 'BOT_MANUAL',
      tenantId: 'tenant-1',
    });
    await updateTelegramGroupApi('group-1', {
      name: '支付二群',
      tenantId: 'tenant-1',
    });
    await approveTelegramGroupApi('group-1', {
      chatId: '-1001234567890',
      chatType: 'supergroup',
      tenantId: 'tenant-1',
    });
    await unbindTelegramGroupApi('group-1', 'tenant-1');

    expect(requestMocks.post).toHaveBeenNthCalledWith(1, '/sys/tg/bots', {
      botType: 'PAYMENT',
      capabilities: ['MANUAL_PAYMENT'],
      name: '支付机器人',
      tenantId: 'tenant-1',
      token: '1234567890:AAabcdefghijklmnopQRST_uvwx',
    });
    expect(requestMocks.put).toHaveBeenNthCalledWith(1, '/sys/tg/bots/bot-1', {
      name: '支付机器人一号',
      tenantId: 'tenant-1',
    });
    expect(requestMocks.request).toHaveBeenCalledWith(
      '/sys/tg/bots/bot-1/status',
      {
        data: { status: 'disabled' },
        method: 'PATCH',
        params: { tenantId: 'tenant-1' },
      },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith('/sys/tg/bots/bot-1', {
      params: { tenantId: 'tenant-1' },
    });
    expect(requestMocks.post).toHaveBeenNthCalledWith(2, '/sys/tg/groups', {
      botId: 'bot-1',
      capabilities: ['MANUAL_PAYMENT'],
      merchantId: 'merchant-1',
      name: '支付一群',
      paymentScene: 'BOT_MANUAL',
      tenantId: 'tenant-1',
    });
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      3,
      '/sys/tg/groups/group-1/approve',
      {
        chatId: '-1001234567890',
        chatType: 'supergroup',
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/sys/tg/groups/group-1',
      { name: '支付二群', tenantId: 'tenant-1' },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith('/sys/tg/groups/group-1', {
      params: { tenantId: 'tenant-1' },
    });
  });

  it('uses tenant-scoped Telegram runtime lifecycle endpoints without a JSON body', async () => {
    requestMocks.post.mockResolvedValue({
      state: 'ONLINE',
      runtimeRunning: true,
    });

    await checkTelegramBotRuntimeApi('bot-1', 'tenant-1');
    await startTelegramBotRuntimeApi('bot-1', 'tenant-1');
    await stopTelegramBotRuntimeApi('bot-1', 'tenant-1');
    await restartTelegramBotRuntimeApi('bot-1', 'tenant-1');

    for (const [index, action] of [
      'check',
      'start',
      'stop',
      'restart',
    ].entries()) {
      expect(requestMocks.post).toHaveBeenNthCalledWith(
        index + 1,
        `/sys/tg/bots/bot-1/runtime/${action}`,
        undefined,
        { params: { tenantId: 'tenant-1' } },
      );
    }
  });

  it('uses the Telegram member and super administrator endpoints', async () => {
    requestMocks.post.mockResolvedValue({ id: 'resource-1' });
    requestMocks.put.mockResolvedValue({ id: 'resource-1' });
    requestMocks.request.mockResolvedValue({ id: 'resource-1' });
    requestMocks.delete.mockResolvedValue(undefined);

    await createTelegramMemberApi({
      capabilities: ['ORDER_QUERY'],
      groupId: 'group-1',
      role: 'OPERATOR',
      telegramUserId: '123456789',
      tenantId: 'tenant-1',
    });
    await updateTelegramMemberApi('member-1', {
      role: 'VIEWER',
      tenantId: 'tenant-1',
    });
    await setTelegramMemberStatusApi('member-1', 'disabled', 'tenant-1');
    await deleteTelegramMemberApi('member-1', 'tenant-1');
    await createTelegramSuperAdminApi({
      groupIds: [],
      scopeType: 'ALL_GROUPS',
      telegramUserId: '987654321',
      tenantId: 'tenant-1',
    });
    await updateTelegramSuperAdminApi('super-1', {
      groupIds: ['group-1'],
      scopeType: 'SPECIFIED_GROUPS',
      tenantId: 'tenant-1',
    });
    await setTelegramSuperAdminStatusApi('super-1', 'disabled', 'tenant-1');
    await deleteTelegramSuperAdminApi('super-1', 'tenant-1');

    expect(requestMocks.post).toHaveBeenNthCalledWith(1, '/sys/tg/members', {
      capabilities: ['ORDER_QUERY'],
      groupId: 'group-1',
      role: 'OPERATOR',
      telegramUserId: '123456789',
      tenantId: 'tenant-1',
    });
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/sys/tg/members/member-1',
      { role: 'VIEWER', tenantId: 'tenant-1' },
    );
    expect(requestMocks.request).toHaveBeenNthCalledWith(
      1,
      '/sys/tg/members/member-1/status',
      {
        data: { status: 'disabled' },
        method: 'PATCH',
        params: { tenantId: 'tenant-1' },
      },
    );
    expect(requestMocks.post).toHaveBeenNthCalledWith(
      2,
      '/sys/tg/super-admins',
      {
        groupIds: [],
        scopeType: 'ALL_GROUPS',
        telegramUserId: '987654321',
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/sys/tg/super-admins/super-1',
      {
        groupIds: ['group-1'],
        scopeType: 'SPECIFIED_GROUPS',
        tenantId: 'tenant-1',
      },
    );
    expect(requestMocks.request).toHaveBeenNthCalledWith(
      2,
      '/sys/tg/super-admins/super-1/status',
      {
        data: { status: 'disabled' },
        method: 'PATCH',
        params: { tenantId: 'tenant-1' },
      },
    );
    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/sys/tg/super-admins/super-1',
      { params: { tenantId: 'tenant-1' } },
    );
  });

  it('loads live appeal reasons and requests automatic receipt handling as JSON', async () => {
    requestMocks.get.mockResolvedValue({ orderNo: 'BIN-1', reasons: [] });
    requestMocks.post.mockResolvedValue({ complaintNo: '30006788' });

    await getMerchantOrderAppealReasonsApi('order-1', {
      merchantId: 'merchant-1',
      tenantId: 'tenant-1',
    });
    await submitMerchantOrderAppealApi('order-1', {
      merchantId: 'merchant-1',
      reasonCode: 6,
      tenantId: 'tenant-1',
    });

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/sys/merchant-orders/order-1/appeal-reasons',
      { params: { merchantId: 'merchant-1', tenantId: 'tenant-1' } },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/sys/merchant-orders/order-1/appeal',
      { merchantId: 'merchant-1', reasonCode: 6, tenantId: 'tenant-1' },
    );
  });
});
