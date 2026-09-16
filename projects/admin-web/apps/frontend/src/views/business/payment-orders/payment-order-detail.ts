import type { BusinessApi } from '#/api';

import { getPaymentOrderApi, queryPaymentOrderUpstreamApi } from '#/api';

export type PaymentOrderDetail = BusinessApi.PaymentOrder & {
  batchItems: BusinessApi.PaymentBatchItem[];
  history: BusinessApi.StatusHistory[];
  upstream?: BusinessApi.PaymentOrderUpstreamQueryResult['upstream'];
};

type PaymentOrderDetailApi = {
  getPaymentOrder: typeof getPaymentOrderApi;
  queryPaymentOrderUpstream: typeof queryPaymentOrderUpstreamApi;
};

const paymentOrderDetailApi: PaymentOrderDetailApi = {
  getPaymentOrder: getPaymentOrderApi,
  queryPaymentOrderUpstream: queryPaymentOrderUpstreamApi,
};

export async function queryPaymentOrderDetail(
  id: string,
  tenantId: string,
  api: PaymentOrderDetailApi = paymentOrderDetailApi,
): Promise<PaymentOrderDetail> {
  const result = await api.queryPaymentOrderUpstream(id, { tenantId });
  const completeDetail = await api.getPaymentOrder(id, { tenantId });

  return {
    ...completeDetail,
    upstream: result.upstream,
  };
}
