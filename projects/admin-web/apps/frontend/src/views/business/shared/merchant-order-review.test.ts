import { describe, expect, it } from 'vitest';

import { merchantOrderReviewReason } from './merchant-order-review';

describe('merchantOrderReviewReason', () => {
  it('explains why a pending identity-mismatch order has no payment order', () => {
    expect(
      merchantOrderReviewReason({
        status: 'PENDING_PAYMENT',
        paymentOrder: null,
        identityMatched: false,
        identityName: '秦逢',
        payeeName: '秦世纪',
      }),
    ).toBe(
      '平台实名“秦逢”与收款人“秦世纪”不一致，系统不会自动创建支付订单，请在商家绑定群组中确认下单或取消订单。',
    );
  });

  it('does not report a mismatch as the reason once a payment order exists', () => {
    expect(
      merchantOrderReviewReason({
        status: 'PENDING_PAYMENT',
        paymentOrder: { id: 'payment-1' },
        identityMatched: false,
        identityName: '秦逢',
        payeeName: '秦世纪',
      }),
    ).toBeNull();
  });
});
