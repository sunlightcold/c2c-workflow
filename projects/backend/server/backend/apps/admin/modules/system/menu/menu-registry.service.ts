import { SysMenuEntity, SysMenuSource, SysMenuType } from '@/apps/admin/database'
import { getDefinePermissions } from '@/common/decorators'
import { StatusEnum } from '@/common/interfaces'
import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'crypto'
import { DataSource, EntityManager, In, IsNull, Not, Repository } from 'typeorm'
import { DEFAULT_ADMIN_MENUS } from './registry/default-admin-menus'
import { AdminMenuDefinition } from './registry/admin-menu.types'

interface SyncDefaultMenuOptions {
  resetSystemMenus?: boolean
  resetCustomMenus?: boolean
}

@Injectable()
export class MenuRegistryService {
  private readonly logger = new Logger(MenuRegistryService.name)

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SysMenuEntity)
    private readonly menuRepository: Repository<SysMenuEntity>,
  ) {}

  async syncDefaultMenus(options: SyncDefaultMenuOptions = {}) {
    this.validateDefinitions(DEFAULT_ADMIN_MENUS)
    const resetSystemMenus = options.resetSystemMenus === true

    await this.dataSource.transaction(async (manager) => {
      if (resetSystemMenus && options.resetCustomMenus === true) {
        await this.resetAllMenus(manager)
      } else if (resetSystemMenus) {
        await this.resetSystemMenus(manager)
      }

      const keyToId = new Map<string, number>()
      for (const definition of DEFAULT_ADMIN_MENUS) {
        const parentId = definition.parentKey ? keyToId.get(definition.parentKey) : undefined
        if (definition.parentKey && !parentId) {
          throw new BadRequestException(`默认菜单父节点不存在: ${definition.parentKey}`)
        }

        const menu = await this.upsertMenu(manager, definition, parentId)
        keyToId.set(definition.key, menu.id)
      }

      await this.deleteRemovedSystemMenus(manager)
    })

    this.logger.log(resetSystemMenus ? '系统默认菜单已重置并注册完成' : '系统默认菜单已同步完成')
  }

  async resetAndSyncDefaultMenus() {
    await this.syncDefaultMenus({ resetSystemMenus: true, resetCustomMenus: true })
  }

  validateDefinitions(definitions: AdminMenuDefinition[]) {
    const keys = new Set<string>()
    const permissions = new Set<string>()
    const definedPermissions = new Set(getDefinePermissions())

    for (const definition of definitions) {
      if (keys.has(definition.key)) {
        throw new BadRequestException(`默认菜单 key 重复: ${definition.key}`)
      }
      keys.add(definition.key)

      if (definition.parentKey && !definitions.some((item) => item.key === definition.parentKey)) {
        throw new BadRequestException(`默认菜单父节点未注册: ${definition.key}`)
      }

      if (definition.type === SysMenuType.PERMISSION && !definition.permission) {
        throw new BadRequestException(`权限节点缺少 permission: ${definition.key}`)
      }

      if (definition.type === SysMenuType.MENU && (!definition.path || !definition.component)) {
        throw new BadRequestException(`页面菜单缺少 path 或 component: ${definition.key}`)
      }

      if (definition.permission) {
        permissions.add(definition.permission)
      }
    }

    for (const permission of definedPermissions) {
      if (!permissions.has(permission)) {
        throw new BadRequestException(`后端权限未注册菜单权限节点: ${permission}`)
      }
    }
  }

  private async upsertMenu(
    manager: EntityManager,
    definition: AdminMenuDefinition,
    parentId?: number,
  ) {
    const repository = manager.getRepository(SysMenuEntity)
    const existing = await this.findExistingMenu(repository, definition)
    const entity = repository.create({
      ...existing,
      ...this.toSystemMenuEntity(definition, parentId),
      id: existing?.id,
    })

    return repository.save(entity)
  }

  private async findExistingMenu(
    repository: Repository<SysMenuEntity>,
    definition: AdminMenuDefinition,
  ) {
    const byKey = await repository.findOne({ where: { key: definition.key } })
    if (byKey) return byKey

    if (definition.type === SysMenuType.PERMISSION && definition.permission) {
      const byPermission = await repository.findOne({
        where: {
          type: SysMenuType.PERMISSION,
          permission: definition.permission,
          key: IsNull(),
        },
      })
      if (byPermission) return byPermission
    }

    if (definition.type !== SysMenuType.PERMISSION && definition.path) {
      const byPath = await repository.findOne({
        where: {
          type: definition.type,
          path: definition.path,
          key: IsNull(),
        },
      })
      if (byPath) return byPath
    }

    return null
  }

  private toSystemMenuEntity(definition: AdminMenuDefinition, parentId?: number) {
    return {
      key: definition.key,
      source: SysMenuSource.System,
      locked: StatusEnum.ENABLED,
      managedHash: this.getManagedHash(definition),
      parentId: parentId ?? null,
      name: definition.name,
      path: definition.path,
      component: definition.component,
      permission: definition.permission,
      type: definition.type,
      icon: definition.icon,
      iframeSrc: definition.iframeSrc,
      status: definition.status ?? StatusEnum.ENABLED,
      keepAlive: definition.keepAlive ?? StatusEnum.ENABLED,
      show: definition.show ?? StatusEnum.ENABLED,
      orderNo: definition.orderNo ?? 0,
    }
  }

  private getManagedHash(definition: AdminMenuDefinition) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          key: definition.key,
          type: definition.type,
          parentKey: definition.parentKey,
          path: definition.path,
          component: definition.component,
          permission: definition.permission,
        }),
      )
      .digest('hex')
  }

  private async resetSystemMenus(manager: EntityManager) {
    const permissions = DEFAULT_ADMIN_MENUS.map((item) => item.permission).filter(
      (permission): permission is string => Boolean(permission),
    )
    const paths = DEFAULT_ADMIN_MENUS.map((item) => item.path).filter((path): path is string =>
      Boolean(path),
    )
    const systemMenus = await manager.getRepository(SysMenuEntity).find({
      where: [
        { source: SysMenuSource.System },
        { key: In(DEFAULT_ADMIN_MENUS.map((item) => item.key)) },
      ],
      select: { id: true },
    })
    const menuIds = systemMenus.map((menu) => menu.id)

    if (menuIds.length > 0) {
      await manager
        .createQueryBuilder()
        .delete()
        .from('sys_role_menu')
        .where('"menuId" IN (:...menuIds)', { menuIds })
        .execute()
      await manager.delete(SysMenuEntity, { id: In(menuIds) })
    }

    const legacyMenus = await manager.getRepository(SysMenuEntity).find({
      where: [
        ...(permissions.length > 0 ? [{ permission: In(permissions) }] : []),
        ...(paths.length > 0 ? [{ path: In(paths) }] : []),
      ],
      select: { id: true },
    })
    const legacyMenuIds = legacyMenus.map((menu) => menu.id)

    if (legacyMenuIds.length > 0) {
      await manager
        .createQueryBuilder()
        .delete()
        .from('sys_role_menu')
        .where('"menuId" IN (:...legacyMenuIds)', { legacyMenuIds })
        .execute()
      await manager.delete(SysMenuEntity, { id: In(legacyMenuIds) })
    }
  }

  private async resetAllMenus(manager: EntityManager) {
    await manager.createQueryBuilder().delete().from('sys_role_menu').execute()
    await manager.createQueryBuilder().delete().from(SysMenuEntity).execute()
  }

  private async deleteRemovedSystemMenus(manager: EntityManager) {
    const removedMenus = await manager.getRepository(SysMenuEntity).find({
      where: [
        {
          source: SysMenuSource.System,
          key: Not(In(DEFAULT_ADMIN_MENUS.map((item) => item.key))),
        },
        { source: SysMenuSource.System, key: IsNull() },
      ],
      select: { id: true },
    })
    const removedMenuIds = removedMenus.map((menu) => menu.id)

    if (removedMenuIds.length === 0) return

    await manager
      .createQueryBuilder()
      .delete()
      .from('sys_role_menu')
      .where('"menuId" IN (:...removedMenuIds)', { removedMenuIds })
      .execute()
    await manager.update(
      SysMenuEntity,
      { parentId: In(removedMenuIds), id: Not(In(removedMenuIds)) },
      { parentId: null },
    )
    await manager.delete(SysMenuEntity, { id: In(removedMenuIds) })
  }
}
