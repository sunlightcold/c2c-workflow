/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysMenuEntity: class MockSysMenuEntity {},
  SysMenuSource: { Custom: 'custom' },
  SysMenuType: {
    FOLDER: 'FOLDER',
    MENU: 'MENU',
    PERMISSION: 'PERMISSION',
  },
  SysRoleEntity: class MockSysRoleEntity {},
}))

jest.mock('@/common/interfaces', () => ({
  StatusEnum: { DISABLED: 0, ENABLED: 1 },
}))

jest.mock('@/common/utils', () => ({
  isEmpty: jest.fn((value: unknown) => value === undefined || value === null),
  isSuperAdminUid: jest.fn(() => false),
}))

jest.mock('apps/admin/modules/cache', () => ({ CacheService: class MockCacheService {} }), {
  virtual: true,
})

import { MenuService } from './menu.service'

describe('MenuService frontend menus', () => {
  it('includes structural parent folders for role-assigned pages', async () => {
    const merchantFolder = {
      id: 10,
      name: '商家管理',
      orderNo: 995,
      parentId: null,
      type: 'FOLDER',
    }
    const merchantPage = {
      id: 11,
      name: '商家账号',
      orderNo: 20,
      parentId: 10,
      type: 'MENU',
    }
    const unrelatedFolder = {
      id: 20,
      name: '支付管理',
      orderNo: 994,
      parentId: null,
      type: 'FOLDER',
    }
    const menuRepository = {
      find: jest
        .fn()
        .mockResolvedValueOnce([merchantPage])
        .mockResolvedValueOnce([merchantFolder, unrelatedFolder, merchantPage]),
    }
    const service = new MenuService()
    ;(service as any).menuRepository = menuRepository

    await expect(service.findFrontendMenusByRoleIds([3])).resolves.toEqual([
      merchantFolder,
      merchantPage,
    ])
  })
})
