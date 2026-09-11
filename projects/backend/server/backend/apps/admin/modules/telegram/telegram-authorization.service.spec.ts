import { ActorType, StatusEnum } from '@/common/interfaces'
import {
  BusinessStatus,
  TelegramGroupBindingState,
  TelegramSuperAdminScopeType,
} from '@admin/database'
import { TelegramAuthorizationService } from './telegram-authorization.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramAuthorizationService', () => {
  it('authorizes an active member through the bot, group, merchant, and backend user', async () => {
    const groups = {
      findOne: jest.fn().mockResolvedValue({
        id: 'group-1',
        tenantId: 'tenant-1',
        botId: 'bot-1',
        merchantId: 'merchant-1',
        capabilities: [TelegramCapability.ORDER_QUERY, TelegramCapability.MANUAL_PAYMENT],
        bindingState: TelegramGroupBindingState.ACTIVE,
      }),
    }
    const merchants = {
      findOne: jest.fn().mockResolvedValue({ id: 'merchant-1', status: BusinessStatus.ACTIVE }),
    }
    const members = {
      findOne: jest.fn().mockResolvedValue({
        userId: 7,
        capabilities: [TelegramCapability.ORDER_QUERY],
        status: BusinessStatus.ACTIVE,
      }),
    }
    const superAdmins = { findOne: jest.fn().mockResolvedValue(null) }
    const users = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        actorType: ActorType.TENANT,
        tenantId: 'tenant-1',
        status: StatusEnum.ENABLED,
      }),
    }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
      users as never,
    )

    await expect(
      service.authorize(
        {
          id: 'bot-1',
          tenantId: 'tenant-1',
          capabilities: [TelegramCapability.ORDER_QUERY, TelegramCapability.MANUAL_PAYMENT],
        },
        '-1001',
        '88',
      ),
    ).resolves.toMatchObject({
      allowed: true,
      capabilities: [TelegramCapability.ORDER_QUERY],
      group: { id: 'group-1', merchantId: 'merchant-1' },
      user: { id: 7 },
    })
  })

  it('rejects a member when the mapped backend user is disabled', async () => {
    const groups = {
      findOne: jest.fn().mockResolvedValue({ id: 'group-1', merchantId: 'merchant-1' }),
    }
    const merchants = { findOne: jest.fn().mockResolvedValue({ id: 'merchant-1' }) }
    const members = { findOne: jest.fn().mockResolvedValue({ userId: 7 }) }
    const superAdmins = { findOne: jest.fn().mockResolvedValue(null) }
    const users = { findOne: jest.fn().mockResolvedValue(null) }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
      users as never,
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
        userId: 1,
        scopeType: TelegramSuperAdminScopeType.SPECIFIED_GROUPS,
        groupIds: ['another-group'],
      }),
    }
    const users = { findOne: jest.fn() }
    const service = new TelegramAuthorizationService(
      groups as never,
      merchants as never,
      members as never,
      superAdmins as never,
      users as never,
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
})
