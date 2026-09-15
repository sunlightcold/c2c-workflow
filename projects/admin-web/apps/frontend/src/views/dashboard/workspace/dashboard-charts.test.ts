import { describe, expect, it } from 'vitest';

import {
  buildBatchOption,
  buildSourceOption,
  buildStatusOption,
  buildTrendOption,
} from './dashboard-charts';

describe('dashboard chart options', () => {
  it('builds a mixed daily trend with business dates and reduced motion support', () => {
    const option = buildTrendOption(
      [
        {
          date: '2026-09-15',
          merchantOrderAmount: '300.00',
          merchantOrderCount: 3,
          paymentAmount: '200.00',
          paymentCount: 2,
          paymentSuccessAmount: '100.00',
          paymentSuccessCount: 1,
        },
      ],
      false,
    );

    expect(option.animation).toBe(false);
    expect(option.xAxis).toMatchObject({ data: ['09-15'] });
    expect(option.series).toHaveLength(3);
  });

  it('maps status and source enums to readable Chinese labels', () => {
    const rows = [{ amount: '88.00', count: 2, key: 'BOT_MANUAL' }];
    const source = buildSourceOption(rows);
    const status = buildStatusOption([
      { amount: '88.00', count: 2, key: 'PLATFORM_CONFIRM_PENDING' },
    ]);

    expect(source.series).toEqual([
      expect.objectContaining({
        data: [{ name: '机器人手工支付', value: 2 }],
      }),
    ]);
    expect(status.yAxis).toMatchObject({ data: ['待平台确认'] });
  });

  it('keeps batch totals complete by grouping remaining states as other', () => {
    const option = buildBatchOption({
      activeBotCount: 0,
      activeGroupCount: 0,
      activeMerchantCount: 0,
      automatedMerchantCount: 0,
      batchCount: 10,
      batchExceptionCount: 1,
      batchProcessingCount: 2,
      batchSuccessCount: 5,
      merchantOrderAmount: '0.00',
      merchantOrderCount: 0,
      pendingPaymentCount: 0,
      pendingReleaseCount: 0,
      paymentAmount: '0.00',
      paymentCount: 0,
      paymentExceptionCount: 0,
      paymentProcessingCount: 0,
      paymentSuccessAmount: '0.00',
      paymentSuccessCount: 0,
      paymentSuccessRate: '0.00',
    });

    expect(option.series).toEqual([
      expect.objectContaining({
        data: expect.arrayContaining([{ name: '其他', value: 2 }]),
      }),
    ]);
  });
});
