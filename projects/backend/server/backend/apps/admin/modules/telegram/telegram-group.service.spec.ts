import { BusinessStatus, PaymentSourceType, TelegramGroupBindingState } from '@admin/database'
import { BadRequestException } from '@nestjs/common'
import { TelegramGroupService } from './telegram-group.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramGroupService', () => {
  const group = {
    id: 'group-1',
    tenantId: 'tenant-1',
    botId: 'bot-1',
    merchantId: 'merchant-1',
    name: '支付群',
    paymentScene: PaymentSourceType.C2C_BUY,
    capabilities: [TelegramCapability.ORDER_QUERY],
    notificationEvents: [],
    notificationsEnabled: true,
    bindingState: TelegramGroupBindingState.ACTIVE,
    verificationCodeHash: null,
    verificationExpiresAt: null,
  }
  const groups = {
    findOne: jest.fn().mockResolvedValue({ ...group }),
    save: jest.fn(async (value) => value),
  }
  const bots = {
    findOne: jest.fn().mockResolvedValue({
      id: 'bot-1',
      tenantId: 'tenant-1',
      status: BusinessStatus.ACTIVE,
      capabilities: [TelegramCapability.ORDER_QUERY],
    }),
  }
  const merchants = {
    findOne: jest.fn(async ({ where }) =>
      where.status === BusinessStatus.ACTIVE
        ? null
        : {
            id: 'merchant-1',
            tenantId: 'tenant-1',
            status: BusinessStatus.DISABLED,
          },
    ),
  }
  const dataSource = null as never

  beforeEach(() => jest.clearAllMocks())

  it('allows group capability maintenance while the bound merchant is disabled', async () => {
    const service = new TelegramGroupService(
      groups as never,
      bots as never,
      merchants as never,
      dataSource,
    )

    await expect(
      service.update('tenant-1', 'group-1', {
        capabilities: [TelegramCapability.ORDER_QUERY],
        merchantId: 'merchant-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        capabilities: [TelegramCapability.ORDER_QUERY],
        merchantId: 'merchant-1',
      }),
    )
    expect(merchants.findOne).toHaveBeenCalledWith({
      where: { id: 'merchant-1', tenantId: 'tenant-1' },
    })
    expect(groups.save).toHaveBeenCalled()
  })

  it('still requires an active merchant when changing the group binding', async () => {
    const service = new TelegramGroupService(
      groups as never,
      bots as never,
      merchants as never,
      dataSource,
    )

    await expect(
      service.update('tenant-1', 'group-1', {
        merchantId: 'merchant-2',
      }),
    ).rejects.toThrow(new BadRequestException('商家不可用或不属于当前所属单位'))
    expect(merchants.findOne).toHaveBeenCalledWith({
      where: {
        id: 'merchant-2',
        status: BusinessStatus.ACTIVE,
        tenantId: 'tenant-1',
      },
    })
    expect(groups.save).not.toHaveBeenCalled()
  })

  it('still rejects creating a new binding for a disabled merchant', async () => {
    const service = new TelegramGroupService(
      groups as never,
      bots as never,
      merchants as never,
      dataSource,
    )

    await expect(
      service.createChallenge('tenant-1', {
        botId: 'bot-1',
        merchantId: 'merchant-1',
        name: '支付群',
        paymentScene: PaymentSourceType.C2C_BUY,
        capabilities: [TelegramCapability.ORDER_QUERY],
      }),
    ).rejects.toThrow(new BadRequestException('商家不可用或不属于当前所属单位'))
    expect(groups.save).not.toHaveBeenCalled()
  })
})
