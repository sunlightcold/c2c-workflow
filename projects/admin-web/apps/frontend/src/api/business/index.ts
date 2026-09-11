import type { CommonPaginationData } from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace BusinessApi {
  export type BusinessStatus = 'active' | 'disabled';
  export type MerchantPlatform = 'BINANCE' | 'OKX';
  export type PaymentExecutionMode = 'BATCH' | 'INSTANT';
  export type PaymentSourceType = 'BOT_MANUAL' | 'C2C_BUY' | 'REFUND';
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
    authorization?: string;
    autoAppealDelayMinutes?: number;
    autoAppealEnabled?: boolean;
    botCode?: string;
    c2cChatOrderCompletedEnabled?: boolean;
    c2cChatOrderCompletedMessage?: string;
    c2cChatOrderCreatedEnabled?: boolean;
    c2cChatOrderCreatedMessage?: string;
    c2cChatOrderPaidEnabled?: boolean;
    c2cChatOrderPaidMessage?: string;
    chatId?: string;
    clientType?: string;
    code: string;
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
    >
  > &
    TenantContext;

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
export const createTenantApi = (
  data: Pick<BusinessApi.Tenant, 'code' | 'name'>,
) => requestClient.post<BusinessApi.Tenant>('/sys/tenants', data);
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
    xUserId?: string;
  },
) =>
  requestClient.post<BusinessApi.MerchantCredential>(
    `/sys/merchants/${id}/platform-credentials`,
    data,
  );

export const getPaymentPlatformsApi = () =>
  requestClient.get<BusinessApi.PaymentPlatform[]>('/sys/payment-platforms');
export const getPaymentAccountsApi = (params: BusinessApi.TenantContext) =>
  requestClient.get<BusinessApi.PaymentAccount[]>('/sys/payment-accounts', {
    params,
  });
export const createPaymentAccountApi = (
  data: BusinessApi.TenantContext &
    Pick<
      BusinessApi.PaymentAccount,
      'code' | 'externalAccountId' | 'name' | 'platformId'
    > & {
      credentialRef: string;
    },
) =>
  requestClient.post<BusinessApi.PaymentAccount>('/sys/payment-accounts', data);
export const openPaymentAccountChannelApi = (
  id: string,
  data: BusinessApi.TenantContext & { channelId: string; configRef?: string },
) => requestClient.post(`/sys/payment-accounts/${id}/channels`, data);
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
