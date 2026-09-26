import { describe, expect, it } from 'vitest';

import {
  businessEnumText,
  createMerchantNameMap,
  formatBusinessTime,
  matchesPaymentRoute,
  merchantPlatformApiBaseUrl,
  merchantPlatformOptions,
  paymentRouteKey,
  platformConfirmationText,
  resolveBusinessEndTime,
  toBusinessGridData,
} from './business-ui';

describe('business time formatting', () => {
  it('uses the compact report timestamp format', () => {
    expect(formatBusinessTime('2026-09-14 21:10:47')).toBe(
      '2026-09-14 21:10:47',
    );
    expect(formatBusinessTime(null)).toBe('-');
  });

  it('only exposes an end time after business processing has ended', () => {
    const updatedAt = '2026-09-14 21:11:59';

    expect(resolveBusinessEndTime('COMPLETED', updatedAt)).toBe(updatedAt);
    expect(resolveBusinessEndTime('EXCEPTION', updatedAt)).toBe(updatedAt);
    expect(resolveBusinessEndTime('FAILED', updatedAt)).toBe(updatedAt);
    expect(resolveBusinessEndTime('PROCESSING', updatedAt)).toBeNull();
  });
});

describe('business status and source labels', () => {
  it('maps internal timeline statuses and sources to Chinese labels', () => {
    expect(businessEnumText('PLATFORM_SYNC')).toBe('平台订单同步');
    expect(businessEnumText('PAYMENT_BATCH_COORDINATOR')).toBe('支付批次处理');
    expect(businessEnumText('PAYMENT_BATCH_SERVICE')).toBe('支付批次服务');
    expect(businessEnumText('AUTOMATIC')).toBe('自动处理');
    expect(businessEnumText('PLATFORM_PAYMENT_CONFIRMATION')).toBe(
      '平台付款确认',
    );
    expect(businessEnumText('PENDING_RELEASE')).toBe('待放币');
    expect(businessEnumText('PLATFORM_CONFIRM_PENDING')).toBe('待平台确认');
    expect(businessEnumText('PARTIAL_SUCCESS')).toBe('部分成功');
    expect(platformConfirmationText('SUCCESS')).toBe('确认成功');
    expect(platformConfirmationText('FAILED')).toBe('确认失败');
  });
});

describe('merchant platform options', () => {
  it('only allows Binance or OKX when creating a merchant', () => {
    expect(merchantPlatformOptions).toEqual([
      { label: '币安', value: 'BINANCE' },
      { label: '欧易', value: 'OKX' },
    ]);
  });

  it('maps supported platforms to their API base URLs', () => {
    expect(merchantPlatformApiBaseUrl('BINANCE')).toBe(
      'https://api.binance.com',
    );
    expect(merchantPlatformApiBaseUrl('OKX')).toBe('https://www.okx.com');
    expect(merchantPlatformApiBaseUrl()).toBe('');
  });
});

describe('merchant display lookup', () => {
  it('resolves merchant names from the already loaded tenant list', () => {
    const merchantNameById = createMerchantNameMap([
      { id: 'merchant-1', name: '币安主账号' },
      { id: 'merchant-2', name: '欧易备用账号' },
    ]);

    expect(merchantNameById.get('merchant-1')).toBe('币安主账号');
    expect(merchantNameById.get('unknown')).toBeUndefined();
  });
});

describe('business grid adapter', () => {
  it('maps non-paginated business lists to the shared resource grid contract', () => {
    expect(toBusinessGridData([{ id: 'tenant-1' }])).toEqual({
      items: [{ id: 'tenant-1' }],
      meta: {
        currentPage: 1,
        itemsPerPage: 1,
        totalItems: 1,
        totalPages: 1,
      },
    });
  });
});

describe('payment route grouping', () => {
  const routedOrder = {
    currency: 'CNY',
    paymentAccountChannelId: 'channel-1',
    paymentAccountId: 'account-1',
  };

  it('keeps account, channel, and currency in the grouping key', () => {
    expect(paymentRouteKey(routedOrder)).toBe('account-1:channel-1:CNY');
    expect(
      matchesPaymentRoute(
        { ...routedOrder, currency: 'USD' },
        'account-1:channel-1:CNY',
      ),
    ).toBe(false);
  });

  it('excludes orders without a locked account-channel route', () => {
    expect(
      paymentRouteKey({ ...routedOrder, paymentAccountChannelId: null }),
    ).toBeNull();
  });
});
