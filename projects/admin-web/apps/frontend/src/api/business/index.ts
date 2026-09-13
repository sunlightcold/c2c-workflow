import type { CommonPaginationData } from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace BusinessApi {
  export type BusinessStatus = 'active' | 'disabled';
  export type MerchantPlatform = 'BINANCE' | 'OKX';
  export type PaymentExecutionMode = 'BATCH' | 'INSTANT';
  export type PaymentSourceType = 'BOT_MANUAL' | 'C2C_BUY' | 'REFUND';
  export type TelegramCapability =
    | 'ALIPAY_BATCH_PAYMENT'
    | 'BALANCE_QUERY'
    | 'BOT_STATUS_MANAGE'
    | 'C2C_APPEAL'
    | 'C2C_DAILY_REPORT'
    | 'C2C_ORDER_PAYMENT'
    | 'GROUP_MEMBER_MANAGE'
    | 'MANUAL_PAYMENT'
    | 'ORDER_QUERY'
    | 'PAYMENT_BATCH_SUBMIT'
    | 'PAYMENT_RESULT_NOTIFICATION'
    | 'PAYMENT_STATISTICS'
    | 'RECEIPT_QUERY';
  export type TelegramBotType = 'HQ' | 'MERCHANT' | 'PAYMENT';
  export type TelegramGroupRole = 'ADMIN' | 'OPERATOR' | 'VIEWER';
  export type TelegramGroupBindingState =
    | 'ACTIVE'
    | 'PAUSED'
    | 'PENDING'
    | 'UNBOUND';
  export type TelegramSuperAdminScopeType = 'ALL_GROUPS' | 'SPECIFIED_GROUPS';
  export type MerchantOrderAppealStatus = 'PROCESSING' | 'SUBMITTED';

  export interface TenantContext {
    tenantId?: string;
  }

  export interface Tenant {
    code: string;
    createdAt: string;
    id: string;
    name: string;
    status: BusinessStatus;
    systemLocked: boolean;
    timezone: string;
    type: 'AGENT' | 'HEADQUARTERS_SELF';
    updatedAt: string;
  }

  export interface Merchant {
    apiBaseUrl: string;
    automaticPaymentEnabled: boolean;
    automaticPaymentExecutionMode: PaymentExecutionMode;
    authMode: 'API_KEY' | 'WEB_COOKIE' | null;
    autoAppealDelayMinutes: number;
    autoAppealEnabled: boolean;
    botCode: null | string;
    c2cChatOrderCompletedEnabled: boolean;
    c2cChatOrderCompletedMessage: null | string;
    c2cChatOrderCreatedEnabled: boolean;
    c2cChatOrderCreatedMessage: null | string;
    c2cChatOrderPaidEnabled: boolean;
    c2cChatOrderPaidMessage: null | string;
    chatId: null | string;
    code: string;
    createdAt: string;
    credentialConfigured: boolean;
    description: null | string;
    externalMerchantId: null | string;
    id: string;
    name: string;
    orderStatusList: number[];
    overlapSeconds: number;
    pageSize: number;
    paidConfirmIntervalMaxMs: number;
    paidConfirmIntervalMinMs: number;
    platform: MerchantPlatform;
    requestTimeoutMs: number;
    status: BusinessStatus;
    tenantId: string;
    updatedAt: string;
  }

  export interface MerchantCredential {
    clientType: null | string;
    createdAt: string;
    credentialConfigured: boolean;
    id: string;
    requestTimeoutMs: number;
    status: BusinessStatus;
    version: number;
    xUserId: null | string;
  }

  export interface PaymentChannelBinding {
    adapterCode: null | string;
    channelCode: null | string;
    channelId: string;
    channelName: null | string;
    concurrencyLimit: number;
    executionMode: null | PaymentExecutionMode;
    id: string;
    maximumAmount: null | string;
    minimumAmount: null | string;
    status: BusinessStatus;
  }

  export interface PaymentAccount {
    channels: PaymentChannelBinding[];
    code: string;
    createdAt: string;
    credentialConfigured: boolean;
    credentialAppId: null | string;
    credentialAuthMode: 'CERT' | 'KEY' | null;
    credentialGateway: null | string;
    credentialUpdatedAt: null | string;
    externalAccountId: string;
    id: string;
    name: string;
    platformId: string;
    status: BusinessStatus;
    tenantId: string;
    updatedAt: string;
  }

  export interface PaymentChannel {
    adapterCode: string;
    code: string;
    executionMode: PaymentExecutionMode;
    id: string;
    name: string;
    status: BusinessStatus;
  }

  export interface PaymentPlatform {
    channels: PaymentChannel[];
    code: string;
    id: string;
    name: string;
    status: BusinessStatus;
  }

  export interface PaymentPlan {
    currency: string;
    id: string;
    merchantId: string;
    paymentAccountChannelId: string;
    paymentAccountId: string;
    priority: number;
    scene: string;
    status: BusinessStatus;
    tenantId: string;
    weight: number;
  }

  export interface UpdatePaymentPlanInput extends TenantContext {
    paymentAccountChannelId?: string;
    paymentAccountId?: string;
    priority?: number;
    weight?: number;
  }

  export interface StatusHistory {
    createdAt: string;
    fromStatus: null | string;
    id: string;
    reason: null | string;
    source: string;
    toStatus: string;
  }

  export interface PaymentOrder {
    amount: string;
    createdAt: string;
    currency: string;
    executionMode: PaymentExecutionMode;
    id: string;
    lastError: null | string;
    merchantId: string;
    payeeIdentity: string;
    payeeName: string;
    paymentAccountChannelId: null | string;
    paymentAccountId: null | string;
    paymentMethod: string;
    paymentNo: string;
    paymentPlanId: null | string;
    sourceBusinessNo: string;
    sourceType: PaymentSourceType;
    status: string;
    tenantId: string;
    updatedAt: string;
    upstreamId: null | string;
  }

  export interface MerchantOrder {
    appealComplaintNo: null | string;
    appealLastError: null | string;
    appealReason: null | string;
    appealReasonCode: null | number;
    appealStatus: MerchantOrderAppealStatus | null;
    appealSubmittedAt: null | string;
    asset: string;
    assetAmount: string;
    counterpartyName: null | string;
    fiatAmount: string;
    fiatCurrency: string;
    id: string;
    identityMatched: boolean;
    lastError: null | string;
    merchantId: string;
    payable: boolean;
    paymentDeadline: null | string;
    paymentMethod: null | string;
    paymentOrder: null | PaymentOrder;
    payeeIdentity: null | string;
    payeeName: null | string;
    platform: MerchantPlatform;
    platformCreatedAt: string;
    platformOrderId: string;
    platformStatus: string;
    status: string;
    tenantId: string;
  }

  export interface MerchantOrderDetail extends MerchantOrder {
    history: StatusHistory[];
    paymentOrder: null | (PaymentOrder & { history: StatusHistory[] });
  }

  export interface MerchantOrderAppealReason {
    reasonCode: number;
    reasonDesc: string;
  }

  export interface PaymentBatch {
    batchNo: string;
    createdAt: string;
    currency: string;
    failedCount: number;
    id: string;
    lastError: null | string;
    merchantId: string;
    paymentAccountId: string;
    paymentAccountChannelId: string;
    processingCount: number;
    status: string;
    successCount: number;
    tenantId: string;
    totalAmount: string;
    totalCount: number;
    unknownCount: number;
    updatedAt: string;
    upstreamId: null | string;
  }

  export interface PaymentBatchItem {
    amount: string;
    errorCode: null | string;
    errorMessage: null | string;
    id: string;
    paymentOrderId: string;
    status: string;
    upstreamId: null | string;
  }

  export interface PageQuery extends TenantContext {
    page: number;
    pageSize: number;
  }

  export interface MerchantQuery extends PageQuery {
    accountCode?: string;
    accountName?: string;
    externalMerchantId?: string;
    platform?: MerchantPlatform;
    status?: BusinessStatus;
  }

  export interface PaymentAccountQuery extends PageQuery {
    accountCode?: string;
    accountName?: string;
    externalAccountId?: string;
    platformId?: string;
    status?: BusinessStatus;
  }

  export interface UpdatePaymentAccountInput extends TenantContext {
    externalAccountId?: string;
    name?: string;
  }

  export interface AlipayPaymentAccountCredential {
    alipayPublicCertContent?: string;
    alipayPublicKey?: string;
    alipayRootCertContent?: string;
    appCertContent?: string;
    appId: string;
    authMode: 'CERT' | 'KEY';
    gateway: string;
    privateKey: string;
  }

  export interface CreatePaymentAccountInput extends TenantContext {
    credential: AlipayPaymentAccountCredential;
    externalAccountId: string;
    name: string;
    platformId: string;
  }

  export interface PaymentAccountChannelInput extends TenantContext {
    concurrencyLimit?: number;
    maximumAmount?: null | string;
    minimumAmount?: null | string;
  }

  export interface MerchantOrderQuery extends PageQuery {
    endTime?: string;
    merchantId: string;
    paymentMethod?: 'ALIPAY';
    platformOrderId?: string;
    startTime?: string;
    status?: string;
  }

  export interface CreateMerchantInput extends TenantContext {
    apiBaseUrl?: string;
    apiKey?: string;
    automaticPaymentEnabled?: boolean;
    automaticPaymentExecutionMode?: PaymentExecutionMode;
    authorization?: string;
    autoAppealDelayMinutes?: number;
    autoAppealEnabled?: boolean;
    c2cChatOrderCompletedEnabled?: boolean;
    c2cChatOrderCompletedMessage?: string;
    c2cChatOrderCreatedEnabled?: boolean;
    c2cChatOrderCreatedMessage?: string;
    c2cChatOrderPaidEnabled?: boolean;
    c2cChatOrderPaidMessage?: string;
    clientType?: string;
    description?: string;
    externalMerchantId: string;
    name: string;
    orderStatusList?: number[];
    overlapSeconds?: number;
    pageSize?: number;
    paidConfirmIntervalMaxMs?: number;
    paidConfirmIntervalMinMs?: number;
    platform: MerchantPlatform;
    requestTimeoutMs?: number;
    secretKey?: string;
    sessionCookie?: string;
    signaturePrivateKey?: string;
    xUserId?: string;
  }

  export type UpdateMerchantInput = Partial<
    Omit<
      CreateMerchantInput,
      | 'apiKey'
      | 'authorization'
      | 'code'
      | 'platform'
      | 'secretKey'
      | 'sessionCookie'
      | 'signaturePrivateKey'
    >
  > &
    TenantContext & { telegramGroupId?: null | string };

  export interface PaymentOrderQuery extends PageQuery {
    executionMode?: PaymentExecutionMode;
    merchantId?: string;
    sourceType?: PaymentSourceType;
    status?: string;
  }

  export interface PaymentBatchQuery extends PageQuery {
    merchantId?: string;
    paymentAccountId?: string;
    status?: string;
  }

  export interface ManualPaymentOrderInput extends TenantContext {
    amount: string;
    currency: string;
    executionMode: PaymentExecutionMode;
    merchantId: string;
    payeeIdentity: string;
    payeeName: string;
    paymentMethod: 'ALIPAY';
    sourceBusinessNo: string;
  }

  export interface TelegramBot {
    botType: TelegramBotType;
    batchSubmitRequireConfirmation: boolean;
    capabilities: TelegramCapability[];
    code: string;
    createdAt: string;
    description: null | string;
    id: string;
    language: string;
    name: string;
    paymentOrderRequireConfirmation: boolean;
    status: BusinessStatus;
    tenantId: string;
    tokenConfigured: boolean;
    updatedAt: string;
    webhookSecretConfigured: boolean;
    webhookUrl: null | string;
  }
  export interface TelegramGroup {
    bindingState: TelegramGroupBindingState;
    botId: string;
    capabilities: TelegramCapability[];
    chatId: null | string;
    chatType: null | string;
    createdAt: string;
    description: null | string;
    id: string;
    merchantId: string;
    name: string;
    notificationsEnabled: boolean;
    notificationEvents: string[];
    paymentScene: PaymentSourceType;
    tenantId: string;
    updatedAt: string;
    verifiedAt: null | string;
  }
  export interface TelegramMember {
    capabilities: TelegramCapability[];
    displayName: null | string;
    groupId: string;
    id: string;
    role: TelegramGroupRole;
    status: BusinessStatus;
    telegramUserId: string;
    telegramUsername: null | string;
    userId: number;
  }
  export interface TelegramSuperAdmin {
    groupIds: string[];
    id: string;
    scopeType: TelegramSuperAdminScopeType;
    status: BusinessStatus;
    telegramUserId: string;
    telegramUsername: null | string;
    userId: number;
  }
  export interface TelegramEligibleUser {
    id: number;
    nickname: string;
    username: string;
  }
}

function toPagination<T>(response: {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}): CommonPaginationData<T> {
  return {
    items: response.items,
    meta: {
      currentPage: response.page,
      itemsPerPage: response.pageSize,
      totalItems: response.total,
      totalPages: Math.ceil(response.total / response.pageSize),
    },
  };
}

export const getTenantsApi = () =>
  requestClient.get<BusinessApi.Tenant[]>('/sys/tenants');
export const createTenantApi = (data: Pick<BusinessApi.Tenant, 'name'>) =>
  requestClient.post<BusinessApi.Tenant>('/sys/tenants', data);
export const setTenantStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
) =>
  requestClient.request<BusinessApi.Tenant>(`/sys/tenants/${id}/status`, {
    data: { status },
    method: 'PATCH',
  });

export async function filterMerchantsApi(params: BusinessApi.MerchantQuery) {
  return toPagination<BusinessApi.Merchant>(
    await requestClient.get('/sys/merchants', { params }),
  );
}
export async function getMerchantsApi(params: BusinessApi.TenantContext) {
  const result = await filterMerchantsApi({
    ...params,
    page: 1,
    pageSize: 100,
  });
  return result.items;
}
export const createMerchantApi = (data: BusinessApi.CreateMerchantInput) =>
  requestClient.post<BusinessApi.Merchant>('/sys/merchants', data);
export const updateMerchantApi = (
  id: string,
  data: BusinessApi.UpdateMerchantInput,
) => requestClient.put<BusinessApi.Merchant>(`/sys/merchants/${id}`, data);
export const setMerchantStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request<BusinessApi.Merchant>(`/sys/merchants/${id}/status`, {
    data: { status },
    method: 'PATCH',
    params: { tenantId },
  });
export const deleteMerchantApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/merchants/${id}`, { params: { tenantId } });
export const testMerchantConnectionApi = (id: string, tenantId?: string) =>
  requestClient.post<{ platform: BusinessApi.MerchantPlatform; success: true }>(
    `/sys/merchants/${id}/test`,
    undefined,
    { params: { tenantId } },
  );
export const getMerchantCredentialsApi = (
  id: string,
  params: BusinessApi.TenantContext,
) =>
  requestClient.get<BusinessApi.MerchantCredential[]>(
    `/sys/merchants/${id}/platform-credentials`,
    {
      params,
    },
  );
export const rotateMerchantCredentialApi = (
  id: string,
  data: BusinessApi.TenantContext & {
    apiKey?: string;
    authorization?: string;
    clientType?: string;
    requestTimeoutMs?: number;
    secretKey?: string;
    sessionCookie?: string;
    signaturePrivateKey?: string;
    xUserId?: string;
  },
) =>
  requestClient.post<BusinessApi.MerchantCredential>(
    `/sys/merchants/${id}/platform-credentials`,
    data,
  );

export const getPaymentPlatformsApi = () =>
  requestClient.get<BusinessApi.PaymentPlatform[]>('/sys/payment-platforms');
export async function filterPaymentAccountsApi(
  params: BusinessApi.PaymentAccountQuery,
) {
  return toPagination<BusinessApi.PaymentAccount>(
    await requestClient.get('/sys/payment-accounts', { params }),
  );
}
export async function getPaymentAccountsApi(params: BusinessApi.TenantContext) {
  const result = await filterPaymentAccountsApi({
    ...params,
    page: 1,
    pageSize: 100,
  });
  return result.items;
}
export const createPaymentAccountApi = (
  data: BusinessApi.CreatePaymentAccountInput,
) =>
  requestClient.post<BusinessApi.PaymentAccount>('/sys/payment-accounts', data);
export const updatePaymentAccountApi = (
  id: string,
  data: BusinessApi.UpdatePaymentAccountInput,
) =>
  requestClient.put<BusinessApi.PaymentAccount>(
    `/sys/payment-accounts/${id}`,
    data,
  );
export const updatePaymentAccountCredentialApi = (
  id: string,
  data: BusinessApi.AlipayPaymentAccountCredential & BusinessApi.TenantContext,
) =>
  requestClient.put<BusinessApi.PaymentAccount>(
    `/sys/payment-accounts/${id}/credential`,
    data,
  );
export const setPaymentAccountStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request<BusinessApi.PaymentAccount>(
    `/sys/payment-accounts/${id}/status`,
    {
      data: { status },
      method: 'PATCH',
      params: { tenantId },
    },
  );
export const deletePaymentAccountApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/payment-accounts/${id}`, {
    params: { tenantId },
  });
export const openPaymentAccountChannelApi = (
  id: string,
  data: BusinessApi.PaymentAccountChannelInput & { channelId: string },
) => requestClient.post(`/sys/payment-accounts/${id}/channels`, data);
export const updatePaymentAccountChannelApi = (
  id: string,
  bindingId: string,
  data: BusinessApi.PaymentAccountChannelInput,
) =>
  requestClient.put(`/sys/payment-accounts/${id}/channels/${bindingId}`, data);
export const setPaymentAccountChannelStatusApi = (
  id: string,
  bindingId: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request(
    `/sys/payment-accounts/${id}/channels/${bindingId}/status`,
    {
      data: { status },
      method: 'PATCH',
      params: { tenantId },
    },
  );
export const deletePaymentAccountChannelApi = (
  id: string,
  bindingId: string,
  tenantId?: string,
) =>
  requestClient.delete(`/sys/payment-accounts/${id}/channels/${bindingId}`, {
    params: { tenantId },
  });
export const getPaymentPlansApi = (
  params: BusinessApi.TenantContext & { merchantId?: string },
) =>
  requestClient.get<BusinessApi.PaymentPlan[]>('/sys/payment-plans', {
    params,
  });
export const createPaymentPlanApi = (
  data: BusinessApi.TenantContext &
    Pick<
      BusinessApi.PaymentPlan,
      | 'currency'
      | 'merchantId'
      | 'paymentAccountChannelId'
      | 'paymentAccountId'
      | 'priority'
      | 'scene'
      | 'weight'
    >,
) => requestClient.post<BusinessApi.PaymentPlan>('/sys/payment-plans', data);
export const updatePaymentPlanApi = (
  id: string,
  data: BusinessApi.UpdatePaymentPlanInput,
) =>
  requestClient.put<BusinessApi.PaymentPlan>(`/sys/payment-plans/${id}`, data);
export const setPaymentPlanStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request<BusinessApi.PaymentPlan>(
    `/sys/payment-plans/${id}/status`,
    {
      data: { status },
      method: 'PATCH',
      params: { tenantId },
    },
  );
export const deletePaymentPlanApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/payment-plans/${id}`, { params: { tenantId } });

export async function getMerchantOrdersApi(
  params: BusinessApi.MerchantOrderQuery,
) {
  return toPagination<BusinessApi.MerchantOrder>(
    await requestClient.get('/sys/merchant-orders', { params }),
  );
}
export const getMerchantOrderApi = (
  id: string,
  params: BusinessApi.TenantContext & { merchantId: string },
) =>
  requestClient.get<BusinessApi.MerchantOrderDetail>(
    `/sys/merchant-orders/${id}`,
    { params },
  );
export const syncMerchantOrdersApi = (
  id: string,
  params: BusinessApi.TenantContext,
) =>
  requestClient.post<{ created: number; scanned: number; updated: number }>(
    `/sys/merchants/${id}/orders/sync`,
    undefined,
    { params },
  );
export const createMerchantOrderPaymentApi = (
  id: string,
  data: BusinessApi.TenantContext & {
    executionMode: BusinessApi.PaymentExecutionMode;
    merchantId: string;
  },
) =>
  requestClient.post<BusinessApi.PaymentOrder>(
    `/sys/merchant-orders/${id}/payment`,
    data,
  );
export const confirmMerchantOrderPaidApi = (
  id: string,
  data: BusinessApi.TenantContext & { merchantId: string },
) =>
  requestClient.post<BusinessApi.PaymentOrder>(
    `/sys/merchant-orders/${id}/confirm-paid`,
    data,
  );
export const cancelMerchantOrderApi = (
  id: string,
  data: BusinessApi.TenantContext & { merchantId: string; reason: string },
) => requestClient.post(`/sys/merchant-orders/${id}/cancel`, data);
export const getMerchantOrderAppealReasonsApi = (
  id: string,
  params: BusinessApi.TenantContext & { merchantId: string },
) =>
  requestClient.get<{
    orderNo: string;
    reasons: BusinessApi.MerchantOrderAppealReason[];
  }>(`/sys/merchant-orders/${id}/appeal-reasons`, { params });
export const submitMerchantOrderAppealApi = (
  id: string,
  data: BusinessApi.TenantContext & {
    description: string;
    merchantId: string;
    reasonCode: number;
    receipt: Blob;
  },
) => {
  const body = new FormData();
  if (data.tenantId) body.append('tenantId', data.tenantId);
  body.append('merchantId', data.merchantId);
  body.append('reasonCode', String(data.reasonCode));
  body.append('description', data.description);
  body.append('receipt', data.receipt);
  return requestClient.post<{
    complaintNo: string;
    orderNo: string;
    reason: string;
    reasonCode: number;
  }>(`/sys/merchant-orders/${id}/appeal`, body);
};

export async function getPaymentOrdersApi(
  params: BusinessApi.PaymentOrderQuery,
) {
  return toPagination<BusinessApi.PaymentOrder>(
    await requestClient.get('/sys/payment-orders', { params }),
  );
}
export const getPaymentOrderApi = (
  id: string,
  params: BusinessApi.TenantContext,
) =>
  requestClient.get<
    BusinessApi.PaymentOrder & {
      batchItems: BusinessApi.PaymentBatchItem[];
      history: BusinessApi.StatusHistory[];
    }
  >(`/sys/payment-orders/${id}`, { params });
export const createManualPaymentOrderApi = (
  data: BusinessApi.ManualPaymentOrderInput,
) => requestClient.post<BusinessApi.PaymentOrder>('/sys/payment-orders', data);
export const rematchPaymentOrderApi = (
  id: string,
  data: BusinessApi.TenantContext,
) =>
  requestClient.post<BusinessApi.PaymentOrder>(
    `/sys/payment-orders/${id}/rematch`,
    data,
  );
export const reconcilePaymentOrderApi = (
  id: string,
  data: BusinessApi.TenantContext,
) =>
  requestClient.post<BusinessApi.PaymentOrder>(
    `/sys/payment-orders/${id}/reconcile`,
    data,
  );

export async function getPaymentBatchesApi(
  params: BusinessApi.PaymentBatchQuery,
) {
  return toPagination<BusinessApi.PaymentBatch>(
    await requestClient.get('/sys/payment-batches', { params }),
  );
}
export const getPaymentBatchApi = (
  id: string,
  params: BusinessApi.TenantContext,
) =>
  requestClient.get<{
    batch: BusinessApi.PaymentBatch;
    items: BusinessApi.PaymentBatchItem[];
  }>(`/sys/payment-batches/${id}`, { params });
export const createPaymentBatchApi = (
  data: BusinessApi.TenantContext & { paymentOrderIds: string[] },
) => requestClient.post('/sys/payment-batches', data);
export const submitPaymentBatchApi = (
  id: string,
  data: BusinessApi.TenantContext,
) => requestClient.post(`/sys/payment-batches/${id}/submit`, data);
export const reconcilePaymentBatchApi = (
  id: string,
  data: BusinessApi.TenantContext,
) => requestClient.post(`/sys/payment-batches/${id}/reconcile`, data);

export interface TelegramPageQuery extends BusinessApi.TenantContext {
  page: number;
  pageSize: number;
}
export async function getTelegramBotsApi(
  params: TelegramPageQuery & {
    code?: string;
    name?: string;
    status?: BusinessApi.BusinessStatus;
  },
) {
  return toPagination<BusinessApi.TelegramBot>(
    await requestClient.get('/sys/tg/bots', { params }),
  );
}
export const createTelegramBotApi = (
  data: BusinessApi.TenantContext & {
    batchSubmitRequireConfirmation?: boolean;
    botType: BusinessApi.TelegramBotType;
    capabilities: BusinessApi.TelegramCapability[];
    description?: string;
    name: string;
    paymentOrderRequireConfirmation?: boolean;
    tokenRef: string;
    webhookSecretRef?: string;
    webhookUrl?: string;
  },
) => requestClient.post<BusinessApi.TelegramBot>('/sys/tg/bots', data);
export const updateTelegramBotApi = (
  id: string,
  data: BusinessApi.TenantContext &
    Partial<{
      batchSubmitRequireConfirmation: boolean;
      botType: BusinessApi.TelegramBotType;
      capabilities: BusinessApi.TelegramCapability[];
      description: string;
      name: string;
      paymentOrderRequireConfirmation: boolean;
      tokenRef: string;
      webhookSecretRef: string;
      webhookUrl: string;
    }>,
) => requestClient.put<BusinessApi.TelegramBot>(`/sys/tg/bots/${id}`, data);
export const setTelegramBotStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request(`/sys/tg/bots/${id}/status`, {
    method: 'PATCH',
    params: { tenantId },
    data: { status },
  });
export const deleteTelegramBotApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/tg/bots/${id}`, { params: { tenantId } });
export async function getTelegramGroupsApi(
  params: TelegramPageQuery & {
    bindingState?: BusinessApi.TelegramGroupBindingState;
    botId?: string;
    merchantId?: string;
    name?: string;
  },
) {
  return toPagination<BusinessApi.TelegramGroup>(
    await requestClient.get('/sys/tg/groups', { params }),
  );
}
export const createTelegramGroupApi = (
  data: BusinessApi.TenantContext & {
    botId: string;
    capabilities: BusinessApi.TelegramCapability[];
    description?: string;
    merchantId: string;
    name: string;
    notificationEvents?: string[];
    notificationsEnabled?: boolean;
    paymentScene: 'BOT_MANUAL' | 'C2C_BUY';
  },
) =>
  requestClient.post<BusinessApi.TelegramGroup & { verificationCode: string }>(
    '/sys/tg/groups',
    data,
  );
export const updateTelegramGroupApi = (
  id: string,
  data: BusinessApi.TenantContext &
    Partial<{
      botId: string;
      capabilities: BusinessApi.TelegramCapability[];
      description: string;
      merchantId: string;
      name: string;
      notificationEvents: string[];
      notificationsEnabled: boolean;
      paymentScene: 'BOT_MANUAL' | 'C2C_BUY';
    }>,
) => requestClient.put<BusinessApi.TelegramGroup>(`/sys/tg/groups/${id}`, data);
export const approveTelegramGroupApi = (
  id: string,
  data: BusinessApi.TenantContext & {
    chatId: string;
    chatName?: string;
    chatType?: 'group' | 'supergroup';
  },
) =>
  requestClient.post<BusinessApi.TelegramGroup>(
    `/sys/tg/groups/${id}/approve`,
    data,
  );
export const unbindTelegramGroupApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/tg/groups/${id}`, { params: { tenantId } });
export async function getTelegramMembersApi(
  params: TelegramPageQuery & {
    groupId?: string;
    role?: BusinessApi.TelegramGroupRole;
    status?: BusinessApi.BusinessStatus;
    telegramUserId?: string;
  },
) {
  return toPagination<BusinessApi.TelegramMember>(
    await requestClient.get('/sys/tg/members', { params }),
  );
}
export const createTelegramMemberApi = (
  data: BusinessApi.TenantContext & {
    capabilities: BusinessApi.TelegramCapability[];
    displayName?: string;
    groupId: string;
    role: BusinessApi.TelegramGroupRole;
    telegramUserId: string;
    telegramUsername?: string;
    userId: number;
  },
) => requestClient.post<BusinessApi.TelegramMember>('/sys/tg/members', data);
export const updateTelegramMemberApi = (
  id: string,
  data: BusinessApi.TenantContext &
    Partial<{
      capabilities: BusinessApi.TelegramCapability[];
      displayName: string;
      role: BusinessApi.TelegramGroupRole;
      telegramUserId: string;
      telegramUsername: string;
    }>,
) =>
  requestClient.put<BusinessApi.TelegramMember>(`/sys/tg/members/${id}`, data);
export const setTelegramMemberStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request(`/sys/tg/members/${id}/status`, {
    method: 'PATCH',
    params: { tenantId },
    data: { status },
  });
export const deleteTelegramMemberApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/tg/members/${id}`, { params: { tenantId } });
export const getTelegramMemberEligibleUsersApi = (tenantId?: string) =>
  requestClient.get<BusinessApi.TelegramEligibleUser[]>(
    '/sys/tg/members/eligible-users',
    { params: { tenantId } },
  );
export async function getTelegramSuperAdminsApi(
  params: TelegramPageQuery & {
    scopeType?: BusinessApi.TelegramSuperAdminScopeType;
    status?: BusinessApi.BusinessStatus;
    telegramUserId?: string;
  },
) {
  return toPagination<BusinessApi.TelegramSuperAdmin>(
    await requestClient.get('/sys/tg/super-admins', { params }),
  );
}
export const createTelegramSuperAdminApi = (
  data: BusinessApi.TenantContext & {
    groupIds: string[];
    scopeType: BusinessApi.TelegramSuperAdminScopeType;
    telegramUserId: string;
    telegramUsername?: string;
    userId: number;
  },
) =>
  requestClient.post<BusinessApi.TelegramSuperAdmin>(
    '/sys/tg/super-admins',
    data,
  );
export const updateTelegramSuperAdminApi = (
  id: string,
  data: BusinessApi.TenantContext &
    Partial<{
      groupIds: string[];
      scopeType: BusinessApi.TelegramSuperAdminScopeType;
      telegramUserId: string;
      telegramUsername: string;
    }>,
) =>
  requestClient.put<BusinessApi.TelegramSuperAdmin>(
    `/sys/tg/super-admins/${id}`,
    data,
  );
export const setTelegramSuperAdminStatusApi = (
  id: string,
  status: BusinessApi.BusinessStatus,
  tenantId?: string,
) =>
  requestClient.request(`/sys/tg/super-admins/${id}/status`, {
    method: 'PATCH',
    params: { tenantId },
    data: { status },
  });
export const deleteTelegramSuperAdminApi = (id: string, tenantId?: string) =>
  requestClient.delete(`/sys/tg/super-admins/${id}`, { params: { tenantId } });
export const getTelegramSuperAdminEligibleUsersApi = (tenantId?: string) =>
  requestClient.get<BusinessApi.TelegramEligibleUser[]>(
    '/sys/tg/super-admins/eligible-users',
    { params: { tenantId } },
  );
