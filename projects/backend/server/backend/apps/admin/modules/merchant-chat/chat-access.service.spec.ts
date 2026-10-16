jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))
import { ActorType, StatusEnum } from '@/common/interfaces'
import { BusinessStatus, SysUserEntity } from '@admin/database'
import { BusinessScopeService } from '../business/business-scope.service'
import { ChatAccessService } from './chat-access.service'

describe('Chat current authorization', () => {
  const users = { findOne: jest.fn() }
  const tenants = { existsBy: jest.fn() }
  const database = {
    getRepository: (entity: unknown) => (entity === SysUserEntity ? users : tenants),
  }
  const cache = { getPermissions: jest.fn() }
  const access = new ChatAccessService(
    database as never,
    cache as never,
    new BusinessScopeService(),
  )
  const actor = { uid: 17, username: 'operator', actorType: ActorType.TENANT, tenantId: 'tenant' }
  beforeEach(() => {
    jest.clearAllMocks()
    users.findOne.mockResolvedValue({
      id: 17,
      username: 'operator',
      actorType: ActorType.TENANT,
      tenantId: 'tenant',
      status: StatusEnum.ENABLED,
      authzVersion: 2,
    })
    tenants.existsBy.mockResolvedValue(true)
    cache.getPermissions.mockResolvedValue(['merchant:chat:read'])
  })
  it('allows read-only access but requires both permissions to reply and restricts tenant scope', async () => {
    await expect(access.authorize(actor)).resolves.toBe('tenant')
    await expect(access.authorize(actor, 'tenant', true)).rejects.toThrow('无聊天操作权限')
    cache.getPermissions.mockResolvedValue(['merchant:chat:reply'])
    await expect(access.authorize(actor, 'tenant', true)).rejects.toThrow('无聊天操作权限')
    cache.getPermissions.mockResolvedValue(['merchant:chat:read', 'merchant:chat:reply'])
    await expect(access.authorize(actor, 'other', true)).rejects.toThrow('访问范围不匹配')
    expect(tenants.existsBy).toHaveBeenCalledWith({ id: 'tenant', status: BusinessStatus.ACTIVE })
  })
  it('uses current database identity and notices disabled users and tenants', async () => {
    users.findOne.mockResolvedValue({
      id: 17,
      username: 'operator',
      actorType: ActorType.TENANT,
      tenantId: 'new-tenant',
      status: StatusEnum.ENABLED,
    })
    await expect(access.authorize(actor, 'tenant')).rejects.toThrow('访问范围不匹配')
    await expect(access.authorize(actor, 'new-tenant')).resolves.toBe('new-tenant')
    tenants.existsBy.mockResolvedValue(false)
    await expect(access.authorize(actor, 'new-tenant')).rejects.toThrow('经营单位已停用')
    users.findOne.mockResolvedValue({ id: 17, status: StatusEnum.DISABLED })
    await expect(access.authorize(actor)).rejects.toThrow('聊天权限已失效')
  })
})
