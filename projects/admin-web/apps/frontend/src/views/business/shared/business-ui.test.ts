import { describe, expect, it } from 'vitest';

import {
  matchesPaymentRoute,
  merchantPlatformOptions,
  paymentRouteKey,
} from './business-ui';

describe('merchant platform options', () => {
  it('only allows Binance or OKX when creating a merchant', () => {
    expect(merchantPlatformOptions).toEqual([
      { label: '币安', value: 'BINANCE' },
      { label: '欧易', value: 'OKX' },
    ]);
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
