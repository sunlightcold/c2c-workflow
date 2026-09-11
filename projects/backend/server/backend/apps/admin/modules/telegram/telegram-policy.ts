import { BadRequestException } from '@nestjs/common'

export enum TelegramCapability {
  BALANCE_QUERY = 'BALANCE_QUERY',
  ORDER_QUERY = 'ORDER_QUERY',
  RECEIPT_QUERY = 'RECEIPT_QUERY',
  PAYMENT_STATISTICS = 'PAYMENT_STATISTICS',
  MANUAL_PAYMENT = 'MANUAL_PAYMENT',
  ALIPAY_BATCH_PAYMENT = 'ALIPAY_BATCH_PAYMENT',
  PAYMENT_BATCH_SUBMIT = 'PAYMENT_BATCH_SUBMIT',
  C2C_ORDER_PAYMENT = 'C2C_ORDER_PAYMENT',
  PAYMENT_RESULT_NOTIFICATION = 'PAYMENT_RESULT_NOTIFICATION',
  C2C_APPEAL = 'C2C_APPEAL',
  C2C_DAILY_REPORT = 'C2C_DAILY_REPORT',
  GROUP_MEMBER_MANAGE = 'GROUP_MEMBER_MANAGE',
  BOT_STATUS_MANAGE = 'BOT_STATUS_MANAGE',
}

export enum TelegramGroupRole {
  ADMIN = 'ADMIN',
  OPERATOR = 'OPERATOR',
  VIEWER = 'VIEWER',
}

export enum TelegramBotType {
  HQ = 'HQ',
  MERCHANT = 'MERCHANT',
  PAYMENT = 'PAYMENT',
}

export const TELEGRAM_CAPABILITY_OPTIONS = [
  [TelegramCapability.BALANCE_QUERY, '余额查询'],
  [TelegramCapability.ORDER_QUERY, '订单查询'],
  [TelegramCapability.RECEIPT_QUERY, '获取回单'],
  [TelegramCapability.PAYMENT_STATISTICS, '支付统计'],
  [TelegramCapability.MANUAL_PAYMENT, '手工支付'],
  [TelegramCapability.ALIPAY_BATCH_PAYMENT, '支付宝批量支付'],
  [TelegramCapability.PAYMENT_BATCH_SUBMIT, '提交支付批次'],
  [TelegramCapability.C2C_ORDER_PAYMENT, 'C2C 买币订单支付'],
  [TelegramCapability.PAYMENT_RESULT_NOTIFICATION, '付款结果通知'],
  [TelegramCapability.C2C_APPEAL, 'C2C 订单申诉'],
  [TelegramCapability.C2C_DAILY_REPORT, 'C2C 日报'],
  [TelegramCapability.GROUP_MEMBER_MANAGE, '群成员管理'],
  [TelegramCapability.BOT_STATUS_MANAGE, '机器人状态管理'],
] as const

const MEMBER_CAPABILITIES: Record<TelegramGroupRole, readonly TelegramCapability[]> = {
  [TelegramGroupRole.ADMIN]: Object.values(TelegramCapability),
  [TelegramGroupRole.OPERATOR]: [
    TelegramCapability.BALANCE_QUERY,
    TelegramCapability.ORDER_QUERY,
    TelegramCapability.RECEIPT_QUERY,
    TelegramCapability.PAYMENT_STATISTICS,
    TelegramCapability.MANUAL_PAYMENT,
    TelegramCapability.ALIPAY_BATCH_PAYMENT,
    TelegramCapability.PAYMENT_BATCH_SUBMIT,
    TelegramCapability.C2C_ORDER_PAYMENT,
    TelegramCapability.C2C_APPEAL,
    TelegramCapability.C2C_DAILY_REPORT,
  ],
  [TelegramGroupRole.VIEWER]: [
    TelegramCapability.BALANCE_QUERY,
    TelegramCapability.ORDER_QUERY,
    TelegramCapability.RECEIPT_QUERY,
    TelegramCapability.PAYMENT_STATISTICS,
    TelegramCapability.C2C_DAILY_REPORT,
  ],
}

const BOT_CAPABILITIES: Record<TelegramBotType, readonly TelegramCapability[]> = {
  [TelegramBotType.HQ]: [
    TelegramCapability.BALANCE_QUERY,
    TelegramCapability.ORDER_QUERY,
    TelegramCapability.RECEIPT_QUERY,
    TelegramCapability.PAYMENT_STATISTICS,
    TelegramCapability.GROUP_MEMBER_MANAGE,
    TelegramCapability.BOT_STATUS_MANAGE,
  ],
  [TelegramBotType.MERCHANT]: [
    TelegramCapability.BALANCE_QUERY,
    TelegramCapability.ORDER_QUERY,
    TelegramCapability.RECEIPT_QUERY,
    TelegramCapability.PAYMENT_STATISTICS,
    TelegramCapability.GROUP_MEMBER_MANAGE,
  ],
  [TelegramBotType.PAYMENT]: Object.values(TelegramCapability),
}

export function assertBotCapabilities(
  botType: TelegramBotType,
  capabilities: readonly TelegramCapability[],
) {
  if (!capabilities.length) throw new BadRequestException('机器人至少需要启用一项业务能力')
  if (capabilities.some((capability) => !BOT_CAPABILITIES[botType].includes(capability)))
    throw new BadRequestException('机器人能力与机器人类型不匹配')
}

export function assertGroupCapabilities(
  botCapabilities: readonly TelegramCapability[],
  groupCapabilities: readonly TelegramCapability[],
) {
  if (!groupCapabilities.length) throw new BadRequestException('群组至少需要启用一项业务能力')
  if (groupCapabilities.some((capability) => !botCapabilities.includes(capability)))
    throw new BadRequestException('群组能力超出机器人已启用能力')
}

export function assertMemberCapabilities(
  role: TelegramGroupRole,
  memberCapabilities: readonly TelegramCapability[],
  groupCapabilities: readonly TelegramCapability[],
) {
  if (!memberCapabilities.length) throw new BadRequestException('成员至少需要一项权限')
  const roleCapabilities = MEMBER_CAPABILITIES[role]
  if (
    memberCapabilities.some(
      (capability) =>
        !roleCapabilities.includes(capability) || !groupCapabilities.includes(capability),
    )
  )
    throw new BadRequestException('成员权限超出角色或群组能力')
}

export function getTelegramCapabilityPolicy() {
  return {
    capabilities: TELEGRAM_CAPABILITY_OPTIONS.map(([value, label]) => ({ value, label })),
    roles: Object.entries(MEMBER_CAPABILITIES).map(([role, capabilities]) => ({
      role,
      capabilities,
    })),
    botTypes: Object.entries(BOT_CAPABILITIES).map(([botType, capabilities]) => ({
      botType,
      capabilities,
    })),
  }
}
