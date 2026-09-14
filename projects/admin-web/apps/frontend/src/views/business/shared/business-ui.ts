import type { CommonPaginationData } from '../../../../types/common';

import type { BusinessApi } from '#/api';

import { formatDateTime } from '@vben/utils';

export const businessStatusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'disabled' },
];

export const merchantPlatformOptions = [
  { label: '币安', value: 'BINANCE' },
  { label: '欧易', value: 'OKX' },
];

export function businessStatusText(status: BusinessApi.BusinessStatus) {
  return status === 'active' ? '启用' : '停用';
}

export function businessStatusColor(status: BusinessApi.BusinessStatus) {
  return status === 'active' ? 'success' : 'default';
}

export function merchantPlatformText(platform: BusinessApi.MerchantPlatform) {
  return platform === 'BINANCE' ? '币安' : '欧易';
}

export function merchantPlatformApiBaseUrl(
  platform?: BusinessApi.MerchantPlatform,
) {
  if (platform === 'BINANCE') return 'https://api.binance.com';
  if (platform === 'OKX') return 'https://www.okx.com';
  return '';
}

export function formatBusinessTime(value?: null | string) {
  if (!value) return '-';
  return formatDateTime(value);
}

const terminalBusinessStates = new Set([
  'CANCELLED',
  'COMPLETED',
  'EXCEPTION',
  'EXPIRED',
  'FAILED',
  'FUND_EXCEPTION',
  'FUNDS_EXCEPTION',
  'PARTIAL_SUCCESS',
  'SUCCESS',
]);

export function resolveBusinessEndTime(
  status: string,
  updatedAt?: null | string,
) {
  return terminalBusinessStates.has(status) ? updatedAt : null;
}

type PaymentRouteFields = Pick<
  BusinessApi.PaymentOrder,
  'currency' | 'paymentAccountChannelId' | 'paymentAccountId'
>;

export function paymentRouteKey(order: PaymentRouteFields) {
  if (!order.paymentAccountId || !order.paymentAccountChannelId) return null;
  return `${order.paymentAccountId}:${order.paymentAccountChannelId}:${order.currency}`;
}

export function matchesPaymentRoute(
  order: PaymentRouteFields,
  routeKey: string,
) {
  return paymentRouteKey(order) === routeKey;
}

export function resolvePaymentRoute(
  accounts: readonly BusinessApi.PaymentAccount[],
  paymentAccountId?: null | string,
  paymentAccountChannelId?: null | string,
) {
  const account = accounts.find(({ id }) => id === paymentAccountId);
  const channel = account?.channels.find(
    ({ id }) => id === paymentAccountChannelId,
  );
  return {
    accountName: account?.name ?? '-',
    channelName: channel?.channelName ?? '-',
  };
}

const statusLabels: Record<string, string> = {
  BOT_MANUAL: '机器人手工支付',
  BATCH: '批量有密',
  BUY: '买币',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
  CREATED: '已创建',
  C2C_BUY: 'C2C 买币',
  DISPUTED: '争议中',
  EXCEPTION: '异常',
  EXPIRED: '已过期',
  FAILED: '失败',
  FUND_EXCEPTION: '资金异常',
  FUNDS_EXCEPTION: '资金异常',
  INSTANT: '商家转账',
  NEW: '新订单',
  PARTIAL_SUCCESS: '部分成功',
  PAID_PENDING_PLATFORM_CONFIRM: '待平台确认',
  PAYMENT_PROCESSING: '支付处理中',
  PENDING_CONFIG: '待配置方案',
  PENDING_PAYMENT: '待支付',
  PENDING_RELEASE: '待放币',
  PROCESSING: '处理中',
  READY: '待提交',
  REFUND: '退款',
  SUBMITTING: '提交中',
  SUCCESS: '支付成功',
  UNKNOWN: '结果未知',
  ACTIVE: '已绑定',
  ALL_GROUPS: '全部群组',
  PENDING: '待验证',
  PAUSED: '已暂停',
  SPECIFIED_GROUPS: '指定群组',
  UNBOUND: '已解绑',
};

export function businessEnumText(value?: null | string) {
  return value ? (statusLabels[value] ?? value) : '-';
}

export function businessStateColor(status: string) {
  if (['COMPLETED', 'SUCCESS'].includes(status)) return 'success';
  if (['FAILED', 'FUND_EXCEPTION', 'FUNDS_EXCEPTION'].includes(status))
    return 'error';
  if (['CANCELLED', 'EXPIRED'].includes(status)) return 'default';
  if (['DISPUTED', 'EXCEPTION', 'UNKNOWN'].includes(status)) return 'warning';
  return 'processing';
}

export function toBusinessGridData<T>(items: T[]): CommonPaginationData<T> {
  return {
    items,
    meta: {
      currentPage: 1,
      itemsPerPage: Math.max(items.length, 1),
      totalItems: items.length,
      totalPages: 1,
    },
  };
}
