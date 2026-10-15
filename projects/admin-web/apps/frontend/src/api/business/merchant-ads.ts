import type { BusinessApi } from './index';

import { requestClient } from '#/api/request';

import { toPagination } from './pagination';

export namespace MerchantAdsApi {
  export type MerchantOption = Pick<
    BusinessApi.Merchant,
    'id' | 'name' | 'platform'
  >;
  export type AdStatus = 'OFFLINE' | 'ONLINE' | 'UNKNOWN';
  export type RunStatus =
    | 'APPLIED'
    | 'BLOCKED'
    | 'FAILED'
    | 'HOLD'
    | 'PENDING'
    | 'READY';

  export interface Scope extends BusinessApi.TenantContext {
    merchantId: string;
  }

  export interface Rule {
    excludeInactive?: boolean;
    linkedAdId?: null | string;
    linkedDiscount?: null | string;
    blockedNicknames: string[];
    competitorAmount: string;
    competitorPaymentMethods: string[];
    competitorPeriod: null | number;
    feePercent: null | string;
    fixedLimit: null | string;
    followNickname: null | string;
    intervalSeconds: number;
    merchantOnly: boolean;
    mode: 'DYNAMIC' | 'FIXED';
    profitPerUsdt: null | string;
    referencePaymentMethods: string[];
    referencePosition: number;
    step: string;
  }

  export interface PricingTarget {
    id: string;
    platformAdId: string;
    status: AdStatus;
    enabled: boolean;
  }

  export interface Ad {
    pricing:
      | { discount: string; linkedAd: PricingTarget; role: 'MAIN' }
      | { discount: string; mainAd: PricingTarget; role: 'LINKED' }
      | { role: 'INDEPENDENT' };
    asset: string;
    enabled: boolean;
    fiatCurrency: string;
    id: string;
    lastError: null | string;
    lastSyncedAt: null | string;
    merchantId: string;
    merchantName: string;
    nextRunAt: null | string;
    paymentMethods: string[];
    pendingRunId: null | string;
    platform: BusinessApi.MerchantPlatform;
    platformAdId: string;
    price: string;
    rule: null | Rule;
    ruleVersion: number;
    status: AdStatus;
    tenantId: string;
  }

  export interface Quote {
    activeSeconds?: null | number;
    asset: string;
    fiatCurrency: string;
    maxFiatAmount: string;
    minFiatAmount: string;
    paymentMethods: string[];
    platformAdId: string;
    price: string;
    side: 'BUY' | 'SELL';
    traderNickname: string;
  }

  export interface MarketQuery {
    amount: string;
    asset: 'USDT';
    fiatCurrency: string;
    limit: number;
    merchantOnly: boolean;
    paymentMethods: string[];
    periodMinutes: null | number;
    side: 'BUY' | 'SELL';
  }

  export interface Snapshot {
    fetchedAt: string;
    quotes: Quote[];
    window: { page: number; rows: number };
  }

  export interface Evidence {
    linkedAd?: null | {
      adId: string;
      currentPrice: string;
      discount: string;
      platformAdId: string;
      runId: null | string;
      targetPrice: string;
    };
    linkedFromRunId?: string;
    ownAdIds: string[];
    actualReferencePosition: null | number;
    candidates: {
      eligible: boolean;
      quote: Quote;
      reason: string;
      targetPrice: null | string;
    }[];
    competitorQuery: MarketQuery;
    competitorSnapshot: Snapshot;
    limit: null | string;
    rawLimit: null | string;
    reference: null | Quote;
    referenceQuery: MarketQuery | null;
    referenceSnapshot: null | Snapshot;
    rule: Rule;
    selected: null | Quote;
  }

  export interface Run {
    linkedRun?: null | {
      actualPrice: null | string;
      id: string;
      reason: string;
      status: RunStatus;
    };
    actualPrice: null | string;
    adId: string;
    createdAt: string;
    currentPrice: null | string;
    evidence: Evidence | null;
    finishedAt: null | string;
    id: string;
    merchantId: string;
    merchantName: string;
    platform: BusinessApi.MerchantPlatform;
    platformAdId: string;
    reason: string;
    resultPlatformAdId: null | string;
    ruleVersion: number;
    status: RunStatus;
    targetPrice: null | string;
    tenantId: string;
    trigger: 'AUTO' | 'MANUAL' | 'PREVIEW';
    updatedAt: string;
  }

  export interface AdQuery extends BusinessApi.TenantContext {
    merchantId?: string;
    page: number;
    pageSize: number;
    platform?: BusinessApi.MerchantPlatform;
  }

  export interface RunQuery extends BusinessApi.TenantContext {
    adId?: string;
    merchantId?: string;
    page: number;
    pageSize: number;
  }
}

export const getAdMerchantOptionsApi = (params: BusinessApi.TenantContext) =>
  requestClient.get<MerchantAdsApi.MerchantOption[]>(
    '/sys/merchant-ad-options/merchants',
    { params },
  );

export async function getMerchantAdsApi(params: MerchantAdsApi.AdQuery) {
  return toPagination<MerchantAdsApi.Ad>(
    await requestClient.get('/sys/merchant-ads', { params }),
  );
}

export const getMerchantAdApi = (id: string, params: MerchantAdsApi.Scope) =>
  requestClient.get<MerchantAdsApi.Ad>(`/sys/merchant-ads/${id}`, { params });

export const syncMerchantAdsApi = (
  merchantId: string,
  params: BusinessApi.TenantContext,
) =>
  requestClient.post<{ scanned: number; synced: number }>(
    `/sys/merchants/${merchantId}/ads/sync`,
    undefined,
    { params },
  );

export const updateMerchantAdRuleApi = (
  id: string,
  data: MerchantAdsApi.Scope & { rule: MerchantAdsApi.Rule },
) => requestClient.put<MerchantAdsApi.Ad>(`/sys/merchant-ads/${id}/rule`, data);

export const previewMerchantAdApi = (id: string, data: MerchantAdsApi.Scope) =>
  requestClient.post<MerchantAdsApi.Run>(
    `/sys/merchant-ads/${id}/preview`,
    data,
  );

export const executeMerchantAdApi = (id: string, data: MerchantAdsApi.Scope) =>
  requestClient.post<MerchantAdsApi.Run>(
    `/sys/merchant-ads/${id}/execute`,
    data,
  );

export const setMerchantAdAutomationApi = (
  id: string,
  data: MerchantAdsApi.Scope & { enabled: boolean },
) => {
  const { enabled, ...scope } = data;
  return requestClient.put<MerchantAdsApi.Ad>(
    `/sys/merchant-ads/${id}/${enabled ? 'start' : 'stop'}`,
    scope,
  );
};

export async function getMerchantAdRunsApi(params: MerchantAdsApi.RunQuery) {
  return toPagination<MerchantAdsApi.Run>(
    await requestClient.get('/sys/merchant-ad-runs', { params }),
  );
}

export const getMerchantAdRunApi = (id: string, params: MerchantAdsApi.Scope) =>
  requestClient.get<MerchantAdsApi.Run>(`/sys/merchant-ad-runs/${id}`, {
    params,
  });
