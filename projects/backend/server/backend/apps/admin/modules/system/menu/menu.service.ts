import { SysMenuEntity, SysMenuSource, SysMenuType, SysRoleEntity } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { toPaginationParams } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { isEmpty, isSuperAdminUid } from '@/common/utils'
import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { CacheService } from 'apps/admin/modules/cache'
import { isNotEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { In, Like, Not, Repository } from 'typeorm'
import { MenuCreateDto, MenuFilterDto, MenuListDto, MenuUpdateDto } from './dto'

@Injectable()
export class MenuService {
  @Inject(CacheService) private readonly cacheService: CacheService
  @InjectRepository(SysMenuEntity) private readonly menuRepository: Repository<SysMenuEntity>
  @InjectRepository(SysRoleEntity) private readonly roleRepository: Repository<SysRoleEntity>

  async create(menu: MenuCreateDto) {
    await this.menuRepository.save({
      ...menu,
      source: SysMenuSource.Custom,
      locked: StatusEnum.DISABLED,
    })
  }

  findAll(query: MenuListDto) {
    const { name, status, source, type } = query
    return this.menuRepository.find({
      where: {
        ...(name ? { name: Like(`%${name}%`) } : null),
        ...(!isEmpty(status) ? { status } : null),
        ...(source ? { source } : null),
        ...(type ? { type } : null),
      },
      order: { orderNo: 'DESC' },
    })
  }

  filter(dto: MenuFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { name, status, type, source } = params
    const queryBuilder = this.menuRepository
      .createQueryBuilder('menu')
      .andWhere({
        ...(name && { name: Like(`%${name}%`) }),
        ...(isNotEmpty(type) && { type }),
        ...(isNotEmpty(status) && { status }),
        ...(source && { source }),
      })
      .orderBy('menu.orderNo', 'DESC')
    return paginate(queryBuilder, paginateOptions)
  }

  async findFrontendMenus(uid: number) {
    const roles = await this.roleRepository.findBy({ users: { id: uid } })
    const roleIds = roles.map((role) => role.id)
    return await this.findFrontendMenusByRoleIds(roleIds)
  }

  async findFrontendMenusByRoleIds(roleIds: number[]) {
    const assignedMenus = await this.menuRepository.find({
      where: {
        type: Not(SysMenuType.PERMISSION),
        status: StatusEnum.ENABLED,
        roles: { id: In(roleIds) },
      },
      order: { orderNo: 'DESC' },
    })
    if (assignedMenus.length === 0) return []

    const allMenus = await this.findAllFrontendMenus()
    const menuById = new Map(allMenus.map((menu) => [menu.id, menu]))
    const accessibleIds = new Set(assignedMenus.map((menu) => menu.id))

    for (const menu of assignedMenus) {
      let parentId = menu.parentId
      while (parentId) {
        const parent = menuById.get(parentId)
        if (!parent || accessibleIds.has(parent.id)) break
        accessibleIds.add(parent.id)
        parentId = parent.parentId
      }
    }

    return allMenus.filter((menu) => accessibleIds.has(menu.id))
  }

  async findAllFrontendMenus() {
    return this.menuRepository.find({
      where: { status: StatusEnum.ENABLED, type: Not(SysMenuType.PERMISSION) },
      order: { orderNo: 'DESC' },
    })
  }

  findOne(id: number) {
    return this.menuRepository.findOneBy({ id })
  }

  async update(id: number, dto: MenuUpdateDto) {
    await this.assertEditableMenu(id, dto)
    await this.menuRepository.update(id, dto)
    this.updateMenuLinkUserPermissions([id])
  }

  /**
   * menu 变动时更新关联的用户 permissions
   */
  async updateMenuLinkUserPermissions(menuIds: number[]) {
    const roles: SysRoleEntity[] = await this.roleRepository
      .createQueryBuilder('role')
      .leftJoinAndSelect('role.menus', 'menu')
      .andWhere('menu.id IN (:...menuIds)', { menuIds })
      .leftJoinAndSelect('role.users', 'user')
      .getMany()

    // 收集所有唯一用户ID，避免重复处理
    const userIds = [...new Set(roles.flatMap((role) => role.users.map((user) => user.id)))]

    for (const id of userIds) {
      if (await this.cacheService.getPermissions(id)) {
        await this.refreshUserPermissionsCache(id)
      }
    }
  }

  async remove(id: number) {
    const menu = await this.findOne(id)
    this.assertCustomMenu(menu)
    await this.menuRepository.delete(id)
  }

  /**
   * 检查菜单创建规则是否符合
   */
  async check(dto: Partial<MenuUpdateDto | MenuCreateDto>) {
    if (dto.type === SysMenuType.PERMISSION && !dto.parentId) {
      // 无法直接创建权限，必须有parent
      throw new BadRequestException(ErrorEnum.PERMISSION_REQUIRES_PARENT)
    }
    if (dto.type === SysMenuType.FOLDER && dto.parentId) {
      const parent = await this.findOne(dto.parentId)
      if (isEmpty(parent)) throw new BadRequestException(ErrorEnum.PARENT_MENU_NOT_FOUND)
      if (parent && parent.type !== SysMenuType.FOLDER) {
        // 当前新增为目录但父节点不等于目录时为非法操作
        throw new BadRequestException(ErrorEnum.ILLEGAL_OPERATION_DIRECTORY_PARENT)
      }
    }
  }

  /**
   * 根据菜单ID查找是否有关联角色
   */
  async checkRoleByMenuId(id: number) {
    return await this.roleRepository.exists({
      where: { menus: { id } },
    })
  }

  async getPermissions(uid: number) {
    let permissions: string[] = []
    if (isSuperAdminUid(uid)) {
      permissions = await this.getAllPermissions()
    } else {
      const roles = await this.roleRepository.findBy({ users: { id: uid } })
      const roleIds = roles.map((role) => role.id)
      permissions = await this.getPermissionsByRoleIds(roleIds)
    }
    await this.cacheService.setPermissions(uid, permissions)
    return permissions
  }

  async getPermissionsByRoleIds(roleIds: number[]) {
    const menus = await this.menuRepository.findBy({
      type: SysMenuType.PERMISSION,
      status: StatusEnum.ENABLED,
      roles: { id: In(roleIds) },
    })
    return Array.from(
      new Set(menus.map((menu) => menu.permission).filter((permission) => isNotEmpty(permission))),
    ) as string[]
  }

  async getAllPermissions() {
    const menus = await this.menuRepository.findBy({
      type: SysMenuType.PERMISSION,
      status: StatusEnum.ENABLED,
    })
    return Array.from(
      new Set(menus.map((menu) => menu.permission).filter((permission) => isNotEmpty(permission))),
    ) as string[]
  }

  async refreshUserPermissionsCache(uid: number) {
    const permissions = await this.getPermissions(uid)
    await this.cacheService.setPermissions(uid, permissions)
  }

  async refreshUserPermissionsCacheByRoleIds(uid: number, roleIds: number[]) {
    const permissions = await this.getPermissionsByRoleIds(roleIds)
    await this.cacheService.setPermissions(uid, permissions)
  }

  private async assertEditableMenu(id: number, dto: MenuUpdateDto) {
    const menu = await this.findOne(id)
    if (!menu) return
    if (menu.source !== SysMenuSource.System && menu.locked !== StatusEnum.ENABLED) return

    const payload = dto as Record<string, unknown>
    if (payload.source === SysMenuSource.Custom || payload.locked === StatusEnum.DISABLED) {
      throw new BadRequestException(ErrorEnum.MENU_SYSTEM_LOCKED)
    }

    const structuralFields = [
      'key',
      'source',
      'locked',
      'parentId',
      'path',
      'component',
      'permission',
      'type',
      'iframeSrc',
    ]
    const hasStructuralChange = structuralFields.some((field) => Reflect.has(payload, field))
    if (hasStructuralChange) {
      throw new BadRequestException(ErrorEnum.MENU_SYSTEM_LOCKED)
    }
  }

  private assertCustomMenu(menu?: SysMenuEntity | null) {
    if (!menu) return
    if (menu.source === SysMenuSource.System || menu.locked === StatusEnum.ENABLED) {
      throw new BadRequestException(ErrorEnum.MENU_SYSTEM_LOCKED)
    }
  }
}
