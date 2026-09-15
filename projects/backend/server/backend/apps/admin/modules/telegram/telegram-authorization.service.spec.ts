import {
  BusinessStatus,
  TelegramGroupBindingState,
  TelegramSuperAdminScopeType,
} from '@admin/database'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramAuthorizationService', () => {
  it('authorizes an active member through Telegram identity and scoped capabilities', async () => {
    const groups = {
      findOne: jest.fn().mockResolvedValue({
        id: 'group-1',
        tenantId: 'tenant-1',
        botId: 'bot-1',
        merchantId: 'merchant-1',
        capabilities: [TelegramCapability.ORDER_QUERY, TelegramCapability.ALIPAY_BATCH_PAYMENT],
        bindingState: TelegramGroupBindingState.ACTIVE,
      }),
    }
    const merchants = {
      findOne: jest.fn().mockResolvedValue({ id: 'merchant-1', status: BusinessStatus.ACTIVE }),
    }
    const members = {
      findOne: jest.fn().mockResolvedValue({
        capabilities: [TelegramCapability.ORDER_QUERY],
        status: BusinessStatus.ACTIVE,
      }),
    }
    const superAdmins = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
    )

    await expect(
      service.authorize(
        {
          id: 'bot-1',
          tenantId: 'tenant-1',
          capabilities: [TelegramCapability.ORDER_QUERY, TelegramCapability.ALIPAY_BATCH_PAYMENT],
        },
        '-1001',
        '88',
      ),
    ).resolves.toMatchObject({
      allowed: true,
      capabilities: [TelegramCapability.ORDER_QUERY],
      group: { id: 'group-1', merchantId: 'merchant-1' },
      telegramUserId: '88',
    })
  })

  it('rejects an unregistered Telegram identity', async () => {
    const groups = {
      findOne: jest.fn().mockResolvedValue({ id: 'group-1', merchantId: 'merchant-1' }),
    }
    const merchants = { findOne: jest.fn().mockResolvedValue({ id: 'merchant-1' }) }
    const members = { findOne: jest.fn().mockResolvedValue(null) }
    const superAdmins = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
    )

    await expect(
      service.authorize({ id: 'bot-1', tenantId: 'tenant-1', capabilities: [] }, '-1001', '88'),
    ).resolves.toEqual({ allowed: false, reason: 'USER_NOT_AUTHORIZED' })
  })

  it('limits a super administrator to configured active groups', async () => {
    const group = {
      id: 'group-1',
      merchantId: 'merchant-1',
      capabilities: [TelegramCapability.ORDER_QUERY],
    }
    const groups = { findOne: jest.fn().mockResolvedValue(group) }
    const merchants = { findOne: jest.fn().mockResolvedValue({ id: 'merchant-1' }) }
    const members = { findOne: jest.fn() }
    const superAdmins = {
      findOne: jest.fn().mockResolvedValue({
        scopeType: TelegramSuperAdminScopeType.SPECIFIED_GROUPS,
        groupIds: ['another-group'],
      }),
    }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
    )

    await expect(
      service.authorize(
        {
          id: 'bot-1',
          tenantId: 'tenant-1',
          capabilities: [TelegramCapability.ORDER_QUERY],
        },
        '-1001',
        '88',
      ),
    ).resolves.toEqual({ allowed: false, reason: 'USER_NOT_AUTHORIZED' })
  })

  it('allows only an all-groups super administrator to bind a new group', async () => {
    const groups = { findOne: jest.fn() }
    const merchants = { findOne: jest.fn() }
    const members = { findOne: jest.fn() }
    const superAdmins = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
    )

    await expect(service.canBindGroups('tenant-1', '88')).resolves.toBe(false)
    expect(superAdmins.findOne).toHaveBeenCalledWith({
      where: expect.objectContaining({
        scopeType: TelegramSuperAdminScopeType.ALL_GROUPS,
        tenantId: 'tenant-1',
        telegramUserId: '88',
      }),
    })
  })
})
