// @vitest-environment happy-dom

import type { BusinessApi } from '#/api';

import { describe, expect, it, vi } from 'vitest';

import { queryPaymentOrderDetail } from './payment-order-detail';

describe('payment order upstream detail', () => {
  it('reloads the complete detail after querying upstream', async () => {
    const fullDetail = {
      amount: '1.00',
      batchItems: [],
      createdAt: '2026-09-16 19:24:32',
      currency: 'CNY',
      executionMode: 'BATCH',
      history: [
        {
          createdAt: '2026-09-16 19:24:32',
          fromStatus: null,
          id: 'history-1',
          reason: null,
          source: 'BOT_MANUAL',
          toStatus: 'READY',
        },
      ],
      id: 'payment-order-1',
      lastError: null,
      merchantId: 'merchant-1',
      payeeIdentity: '13631946220',
      payeeName: '陈保廷',
      paymentAccountChannelId: 'channel-1',
      paymentAccountId: 'account-1',
      paymentMethod: 'ALIPAY',
      paymentNo: 'PAY20260916192432192797',
      paymentPlanId: 'plan-1',
      platformConfirmLastError: null,
      platformConfirmStatus: 'SUCCESS',
      sourceBusinessNo: 'TEST-20260915-015',
      sourceType: 'BOT_MANUAL',
      status: 'COMPLETED',
      tenantId: 'tenant-1',
      updatedAt: '2026-09-16 19:27:45',
      upstreamId: '20260916110070001506180065598597',
    } satisfies BusinessApi.PaymentOrder & {
      batchItems: BusinessApi.PaymentBatchItem[];
      history: BusinessApi.StatusHistory[];
    };
    const queryPaymentOrderUpstream = vi.fn().mockResolvedValue({
      order: {
        id: fullDetail.id,
        status: fullDetail.status,
      },
      upstream: {
        raw: { code: '10000' },
        status: 'SUCCESS',
        upstreamId: fullDetail.upstreamId,
      },
    });
    const getPaymentOrder = vi.fn().mockResolvedValue(fullDetail);

    const result = await queryPaymentOrderDetail(
      fullDetail.id,
      fullDetail.tenantId,
      {
        getPaymentOrder,
        queryPaymentOrderUpstream,
      },
    );

    expect(getPaymentOrder).toHaveBeenCalledWith(fullDetail.id, {
      tenantId: fullDetail.tenantId,
    });
    expect(result).toMatchObject({
      executionMode: 'BATCH',
      history: fullDetail.history,
      payeeIdentity: '13631946220',
      payeeName: '陈保廷',
      paymentAccountChannelId: 'channel-1',
      paymentAccountId: 'account-1',
      paymentMethod: 'ALIPAY',
      upstream: {
        status: 'SUCCESS',
      },
    });
  });
});
