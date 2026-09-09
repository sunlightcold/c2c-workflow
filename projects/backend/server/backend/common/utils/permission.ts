import type { SysMenuEntity } from '@/apps/admin/database'
import { SysMenuType } from '@/apps/admin/database'
import type { AuthUser } from '../interfaces'
import { getConfig } from './config'

/**
 * 判断是否是管理平台管理员账号
 */
const superAdminUid = getConfig('common').superAdminUid
export function isSuperAdmin(payload: AuthUser) {
  return payload.uid === superAdminUid
}

export function isSuperAdminUid(uid: number) {
  return uid === superAdminUid
}

// 获取所有菜单以及权限
function filterMenuToTable(menus: SysMenuEntity[], parentMenu: SysMenuEntity | null) {
  const res: Record<string, any>[] = []
  menus.forEach((menu) => {
    // 根级别菜单渲染
    let realMenu: Record<string, any> | undefined
    if (!parentMenu && !menu.parentId && menu.type === SysMenuType.MENU) {
      // 根菜单，查找该跟菜单下子菜单，因为可能会包含权限
      const childMenu = filterMenuToTable(menus, menu)
      realMenu = { ...menu }
      realMenu.children = childMenu
    } else if (!parentMenu && !menu.parentId && menu.type === SysMenuType.FOLDER) {
      // 根目录
      const childMenu = filterMenuToTable(menus, menu)
      realMenu = { ...menu }
      realMenu.children = childMenu
    } else if (parentMenu && parentMenu.id === menu.parentId && menu.type === SysMenuType.MENU) {
      // 子菜单下继续找是否有子菜单
      const childMenu = filterMenuToTable(menus, menu)
      realMenu = { ...menu }
      realMenu.children = childMenu
    } else if (parentMenu && parentMenu.id === menu.parentId && menu.type === SysMenuType.FOLDER) {
      // 如果还是目录，继续递归
      const childMenu = filterMenuToTable(menus, menu)
      realMenu = { ...menu }
      realMenu.children = childMenu
    } else if (
      parentMenu &&
      parentMenu.id === menu.parentId &&
      menu.type === SysMenuType.PERMISSION
    ) {
      realMenu = { ...menu }
    }
    // add curent route
    if (realMenu) {
      realMenu.pid = menu.id
      res.push(realMenu)
    }
  })
  return res
}

export function generatorMenu(menu: SysMenuEntity[]) {
  return filterMenuToTable(menu, null)
}

/**
 * 根据给定的 parentId，返回所有子节点的 id
 */
export function getAllChildrenIdsBFS(menus: SysMenuEntity[], parentId: number): number[] {
  const childrenIds: number[] = []
  const queue: number[] = [parentId] // 初始化队列，包含起始 parentId
  const visited = new Set<number>() // 用于记录已访问的节点，避免循环引用

  while (queue.length > 0) {
    const currentId = queue.shift()! // 从队列中取出当前 id

    // 如果当前节点已经访问过，跳过（避免循环引用）
    if (visited.has(currentId)) {
      continue
    }
    visited.add(currentId)

    for (const item of menus) {
      if (item.parentId === currentId) {
        // 如果子节点未访问过，加入结果和队列
        if (!visited.has(item.id)) {
          childrenIds.push(item.id)
          queue.push(item.id)
        }
      }
    }
  }
  return childrenIds
}
