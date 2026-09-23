import type { BusinessApi } from '#/api';

type ReviewOrder = Pick<
  BusinessApi.MerchantOrderDetail,
  'identityMatched' | 'identityName' | 'payeeName' | 'status'
> & { paymentOrder: null | { id: string } };

export function merchantOrderReviewReason(order: ReviewOrder): null | string {
  if (
    order.status !== 'PENDING_PAYMENT' ||
    order.paymentOrder ||
    order.identityMatched
  ) {
    return null;
  }
  if (!order.identityName || !order.payeeName) {
    return '实名信息不完整，系统不会自动创建支付订单，请核对平台实名与收款人姓名。';
  }
  return `平台实名“${order.identityName}”与收款人“${order.payeeName}”不一致，系统不会自动创建支付订单，请在商家绑定群组中确认下单或取消订单。`;
}
