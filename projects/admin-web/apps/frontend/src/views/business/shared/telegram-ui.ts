import type { BusinessApi } from '#/api';

export const telegramCapabilityOptions: Array<{
  label: string;
  value: BusinessApi.TelegramCapability;
}> = [
  { label: '余额查询', value: 'BALANCE_QUERY' },
  { label: '订单查询', value: 'ORDER_QUERY' },
  { label: '获取回单', value: 'RECEIPT_QUERY' },
  { label: '支付统计', value: 'PAYMENT_STATISTICS' },
  { label: '手工支付', value: 'MANUAL_PAYMENT' },
  { label: '支付宝批量支付', value: 'ALIPAY_BATCH_PAYMENT' },
  { label: '提交支付批次', value: 'PAYMENT_BATCH_SUBMIT' },
  { label: 'C2C 买币订单支付', value: 'C2C_ORDER_PAYMENT' },
  { label: '付款结果通知', value: 'PAYMENT_RESULT_NOTIFICATION' },
  { label: 'C2C 订单申诉', value: 'C2C_APPEAL' },
  { label: 'C2C 日报', value: 'C2C_DAILY_REPORT' },
  { label: '群成员管理', value: 'GROUP_MEMBER_MANAGE' },
  { label: '机器人状态管理', value: 'BOT_STATUS_MANAGE' },
];

export const telegramBotTypeOptions = [
  { label: '支付机器人', value: 'PAYMENT' },
] as const;

export const telegramGroupRoleOptions = [
  { label: '群管理员', value: 'ADMIN' },
  { label: '操作员', value: 'OPERATOR' },
  { label: '只读成员', value: 'VIEWER' },
];

export const telegramPaymentSceneOptions = [
  { label: '机器人付款', value: 'BOT_MANUAL' },
  { label: 'C2C 买币付款', value: 'C2C_BUY' },
];

export const telegramScopeOptions = [
  { label: '全部群组', value: 'ALL_GROUPS' },
  { label: '指定群组', value: 'SPECIFIED_GROUPS' },
];

export const telegramBindingStateOptions = [
  { label: '待验证', value: 'PENDING' },
  { label: '已绑定', value: 'ACTIVE' },
  { label: '已暂停', value: 'PAUSED' },
  { label: '已解绑', value: 'UNBOUND' },
];

export function telegramBotTypeText(type: BusinessApi.TelegramBotType) {
  return (
    telegramBotTypeOptions.find(({ value }) => value === type)?.label ?? type
  );
}

export function telegramRoleText(role: BusinessApi.TelegramGroupRole) {
  return (
    telegramGroupRoleOptions.find(({ value }) => value === role)?.label ?? role
  );
}

export function telegramScopeText(
  scope: BusinessApi.TelegramSuperAdminScopeType,
) {
  return (
    telegramScopeOptions.find(({ value }) => value === scope)?.label ?? scope
  );
}
