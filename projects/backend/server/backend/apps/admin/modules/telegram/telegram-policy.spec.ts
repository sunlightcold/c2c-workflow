import { BadRequestException } from '@nestjs/common'
import {
  TelegramCapability,
  TelegramGroupRole,
  assertGroupCapabilities,
  assertMemberCapabilities,
  getTelegramCapabilityPolicy,
} from './telegram-policy'

describe('TelegramPolicy', () => {
  it('exposes only the payment bot type', () => {
    expect(getTelegramCapabilityPolicy().botTypes).toEqual([
      expect.objectContaining({ botType: 'PAYMENT' }),
    ])
  })

  it('accepts group capabilities that are enabled by the bot', () => {
    expect(() =>
      assertGroupCapabilities(
        [TelegramCapability.ORDER_QUERY, TelegramCapability.ALIPAY_BATCH_PAYMENT],
        [TelegramCapability.ORDER_QUERY],
      ),
    ).not.toThrow()
  })

  it('rejects a group capability that is not enabled by the bot', () => {
    expect(() =>
      assertGroupCapabilities(
        [TelegramCapability.ORDER_QUERY],
        [TelegramCapability.ALIPAY_BATCH_PAYMENT],
      ),
    ).toThrow(new BadRequestException('群组能力超出机器人已启用能力'))
  })

  it('limits read-only members to query capabilities', () => {
    expect(() =>
      assertMemberCapabilities(
        TelegramGroupRole.VIEWER,
        [TelegramCapability.ORDER_QUERY, TelegramCapability.RECEIPT_QUERY],
        [TelegramCapability.ORDER_QUERY, TelegramCapability.RECEIPT_QUERY],
      ),
    ).not.toThrow()
    expect(() =>
      assertMemberCapabilities(
        TelegramGroupRole.VIEWER,
        [TelegramCapability.ALIPAY_BATCH_PAYMENT],
        [TelegramCapability.ALIPAY_BATCH_PAYMENT],
      ),
    ).toThrow(new BadRequestException('成员权限超出角色或群组能力'))
  })
})
