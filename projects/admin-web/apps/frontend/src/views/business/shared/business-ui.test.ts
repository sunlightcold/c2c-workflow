import { describe, expect, it } from 'vitest';

import {
  formatBusinessTime,
  matchesPaymentRoute,
  merchantPlatformApiBaseUrl,
  merchantPlatformOptions,
  paymentRouteKey,
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
