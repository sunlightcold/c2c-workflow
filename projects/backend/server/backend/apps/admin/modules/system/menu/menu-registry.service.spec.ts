/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysMenuEntity: class MockSysMenuEntity {},
  SysMenuSource: {
    Custom: 'custom',
    System: 'system',
  },
  SysMenuTableName: 'sys_menu',
  SysMenuType: {
    FOLDER: 'FOLDER',
    MENU: 'MENU',
    PERMISSION: 'PERMISSION',
    EMBED: 'EMBED',
  },
}))

jest.mock('@/common/decorators', () => ({
  getDefinePermissions: jest.fn(() => ['system:user:read']),
}))

jest.mock('@/common/interfaces', () => ({
  StatusEnum: {
    DISABLED: 0,
    ENABLED: 1,
  },
}))

import { SysMenuEntity, SysMenuType } from '@/apps/admin/database'
import { MenuRegistryService } from './menu-registry.service'
import { DEFAULT_ADMIN_MENUS } from './registry/default-admin-menus'

describe('MenuRegistryService', () => {
  const service = new MenuRegistryService({} as any, {} as any)

  it('registers one business folder with the six operational pages and action permissions', () => {
    const businessPages = DEFAULT_ADMIN_MENUS.filter(
      ({ parentKey, type }) => parentKey === 'business' && type === SysMenuType.MENU,
    )
    const permissions = new Set(
      DEFAULT_ADMIN_MENUS.map(({ permission }) => permission).filter(Boolean),
    )

    expect(DEFAULT_ADMIN_MENUS).toContainEqual(
      expect.objectContaining({ key: 'business', name: '业务运营', type: SysMenuType.FOLDER }),
    )
    expect(businessPages.map(({ key }) => key)).toEqual([
      'business.tenants',
      'business.merchants',
      'business.merchantOrders',
      'business.paymentAccounts',
      'business.paymentOrders',
      'business.paymentBatches',
    ])
    for (const permission of [
      'agency:tenant:read',
      'agency:tenant:create',
      'agency:tenant:update',
      'merchant:account:read',
      'merchant:account:create',
      'merchant:account:credential',
      'merchant:order:read',
      'merchant:order:sync',
      'merchant:order:appeal',
      'payment:account:read',
      'payment:account:create',
      'payment:account:bind',
      'payment:order:read',
      'payment:order:create',
      'payment:order:retry',
      'payment:batch:read',
      'payment:batch:create',
      'payment:batch:submit',
      'payment:batch:retry',
    ]) {
      expect(permissions.has(permission)).toBe(true)
    }
  })

  it('rejects duplicate menu keys', () => {
    expect(() =>
      service.validateDefinitions([
        { key: 'system', type: SysMenuType.FOLDER, name: '系统管理' },
        { key: 'system', type: SysMenuType.FOLDER, name: '系统管理' },
        {
          key: 'system.user.read',
          parentKey: 'system',
          type: SysMenuType.PERMISSION,
          name: '用户查询',
          permission: 'system:user:read',
        },
      ]),
    ).toThrow('默认菜单 key 重复')
  })

  it('rejects backend permissions without registered menu nodes', () => {
    expect(() =>
      service.validateDefinitions([{ key: 'system', type: SysMenuType.FOLDER, name: '系统管理' }]),
    ).toThrow('后端权限未注册菜单权限节点: system:user:read')
  })

  it('requires page menus to declare path and component', () => {
    expect(() =>
      service.validateDefinitions([
        { key: 'system', type: SysMenuType.FOLDER, name: '系统管理' },
        {
          key: 'system.user',
          parentKey: 'system',
          type: SysMenuType.MENU,
          name: '用户管理',
          path: '/system/user',
        },
        {
          key: 'system.user.read',
          parentKey: 'system.user',
          type: SysMenuType.PERMISSION,
          name: '用户查询',
          permission: 'system:user:read',
        },
      ]),
    ).toThrow('页面菜单缺少 path 或 component')
  })

  it('deletes removed system menus during default menu sync', async () => {
    const savedMenus: Array<Record<string, any>> = []
    const repository = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([{ id: 9001 }]),
      create: jest.fn((payload: Record<string, any>) => payload),
      save: jest.fn(async (payload: Record<string, any>) => {
        const saved = { ...payload, id: savedMenus.length + 1 }
        savedMenus.push(saved)
        return saved
      }),
    }
    const queryBuilder = {
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    }
    const manager = {
      getRepository: jest.fn().mockReturnValue(repository),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      update: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
    }
    const dataSource = {
      transaction: jest.fn(async (callback: any) => callback(manager)),
    }
    const syncService = new MenuRegistryService(dataSource as any, {} as any)
    jest.spyOn(syncService, 'validateDefinitions').mockImplementation(() => undefined)

    await syncService.syncDefaultMenus()

    expect(savedMenus.find((menu) => menu.key === 'system')).toMatchObject({
      parentId: null,
    })
    expect(savedMenus.find((menu) => menu.key === 'system.user')?.parentId).toBe(
      savedMenus.find((menu) => menu.key === 'system')?.id,
    )
    expect(queryBuilder.delete).toHaveBeenCalled()
    expect(queryBuilder.from).toHaveBeenCalledWith('sys_role_menu')
    expect(queryBuilder.where).toHaveBeenCalledWith('"menuId" IN (:...removedMenuIds)', {
      removedMenuIds: [9001],
    })
    expect(queryBuilder.update).not.toHaveBeenCalled()
    expect(queryBuilder.set).not.toHaveBeenCalled()
    expect(manager.update).toHaveBeenCalledWith(
      SysMenuEntity,
      expect.objectContaining({ parentId: expect.anything(), id: expect.anything() }),
      { parentId: null },
    )
    expect(manager.delete).toHaveBeenCalledWith(
      SysMenuEntity,
      expect.objectContaining({ id: expect.anything() }),
    )
  })
})
