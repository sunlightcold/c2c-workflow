import type { MerchantAdsApi } from './merchant-ads';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  executeMerchantAdApi,
  getAdMerchantOptionsApi,
  getMerchantAdApi,
  getMerchantAdRunApi,
  getMerchantAdRunsApi,
  getMerchantAdsApi,
  previewMerchantAdApi,
  setMerchantAdAutomationApi,
  syncMerchantAdsApi,
  updateMerchantAdRuleApi,
} from './merchant-ads';

const request = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));
vi.mock('#/api/request', () => ({ requestClient: request }));

describe('merchant advertisements API contract', () => {
  const scope = { merchantId: 'merchant-1', tenantId: 'tenant-1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests the minimal merchant options through advertisement permissions', async () => {
    const merchants = [{ id: 'merchant-1', name: '商家', platform: 'BINANCE' }];
    request.get.mockResolvedValue(merchants);
    await expect(
      getAdMerchantOptionsApi({ tenantId: scope.tenantId }),
    ).resolves.toEqual(merchants);
    expect(request.get).toHaveBeenCalledWith(
      '/sys/merchant-ad-options/merchants',
      {
        params: { tenantId: scope.tenantId },
      },
    );
  });

  it('maps both lists to grid pagination with their exact scope', async () => {
    request.get.mockResolvedValue({
      items: [{ id: 'item-1' }],
      page: 2,
      pageSize: 10,
      total: 11,
    });
    const query = { ...scope, page: 2, pageSize: 10 };
    const ads = await getMerchantAdsApi({ ...query, platform: 'OKX' });
    const runs = await getMerchantAdRunsApi({ ...query, adId: 'ad-1' });

    expect(request.get).toHaveBeenNthCalledWith(1, '/sys/merchant-ads', {
      params: { ...query, platform: 'OKX' },
    });
    expect(request.get).toHaveBeenNthCalledWith(2, '/sys/merchant-ad-runs', {
      params: { ...query, adId: 'ad-1' },
    });
    expect(ads.meta).toEqual({
      currentPage: 2,
      itemsPerPage: 10,
      totalItems: 11,
      totalPages: 2,
    });
    expect(runs.meta).toEqual(ads.meta);
  });

  it('keeps money as strings and does not change the unified strategy', async () => {
    const rule: MerchantAdsApi.Rule = {
      blockedNicknames: ['黑名单同行'],
      competitorAmount: '1000.00',
      competitorPaymentMethods: ['ALIPAY'],
      competitorPeriod: null,
      feePercent: '0.11',
      fixedLimit: null,
      followNickname: null,
      intervalSeconds: 60,
      merchantOnly: true,
      mode: 'DYNAMIC',
      profitPerUsdt: '0.05',
      referencePaymentMethods: [],
      referencePosition: 3,
      step: '0.01',
    };
    await updateMerchantAdRuleApi('ad-1', { ...scope, rule });

    expect(request.put).toHaveBeenCalledTimes(1);
    expect(request.put).toHaveBeenCalledWith('/sys/merchant-ads/ad-1/rule', {
      ...scope,
      rule,
    });
  });

  it('keeps preview, execution and automation as separate scoped actions', async () => {
    await previewMerchantAdApi('ad-1', scope);
    await executeMerchantAdApi('ad-1', scope);
    await setMerchantAdAutomationApi('ad-1', { ...scope, enabled: false });
    await getMerchantAdApi('ad-1', scope);
    await getMerchantAdRunApi('run-1', scope);
    await syncMerchantAdsApi('merchant-1', { tenantId: scope.tenantId });

    expect(request.post.mock.calls).toEqual([
      ['/sys/merchant-ads/ad-1/preview', scope],
      ['/sys/merchant-ads/ad-1/execute', scope],
      [
        '/sys/merchants/merchant-1/ads/sync',
        undefined,
        { params: { tenantId: 'tenant-1' } },
      ],
    ]);
    expect(request.put).toHaveBeenCalledTimes(1);
    expect(request.put).toHaveBeenCalledWith(
      '/sys/merchant-ads/ad-1/stop',
      scope,
    );
    expect(request.get.mock.calls).toEqual([
      ['/sys/merchant-ads/ad-1', { params: scope }],
      ['/sys/merchant-ad-runs/run-1', { params: scope }],
    ]);
  });
});
