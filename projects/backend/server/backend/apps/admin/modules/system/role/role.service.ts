import { SysMenuEntity, SysRoleEntity, SysUserEntity } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { toPaginationParams } from '@/common/dto'
import { CacheService } from '@admin/modules/cache'
import { BadRequestException, forwardRef, Inject, Injectable } from '@nestjs/common'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { isEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { EntityManager, In, Like, Repository } from 'typeorm'
import { MenuService } from '../menu'
import { UserService } from '../user'
import { RoleCreateDto, RoleFilterDto, RoleListDto, RoleUpdateDto } from './role.dto'

@Injectable()
export class RoleService {
  @InjectRepository(SysRoleEntity) private readonly roleRepository: Repository<SysRoleEntity>
  @InjectRepository(SysMenuEntity) private readonly menuRepository: Repository<SysMenuEntity>
  @InjectRepository(SysUserEntity) private readonly userRepository: Repository<SysUserEntity>
  @InjectEntityManager() private readonly entityManager: EntityManager

  @Inject(UserService) private readonly userService: UserService
  @Inject(CacheService) private readonly cacheService: CacheService
  @Inject(forwardRef(() => MenuService)) private readonly menuService: MenuService

  async create({ menuIds, ...data }: RoleCreateDto) {
    const count = await this.roleRepository.count({ where: { value: data.value } })
    if (count > 0) {
      throw new BadRequestException(ErrorEnum.ROLE_NOT_UNIQUE)
    }
    const role = await this.roleRepository.save({
      ...data,
      menus: menuIds ? await this.menuRepository.findBy({ id: In(menuIds) }) : [],
    })
    return { roleId: role.id }
  }

  async findOne(id: number) {
    const role = await this.roleRepository.findOne({ where: { id } })
    const menus = await this.menuRepository.find({ where: { roles: { id } } })
    return { ...role, menuIds: menus.map((menu) => menu.id) }
  }

  filter(dto: RoleFilterDto) {
    const { paginateOptions, params } = toPaginationParams(dto)
    const { name, value, status, description } = params
    const queryBuilder = this.roleRepository.createQueryBuilder('role').andWhere({
      ...(name ? { name: Like(`%${name}%`) } : null),
      ...(value ? { value: Like(`%${value}%`) } : null),
      ...(description ? { description: Like(`%${description}%`) } : null),
      ...(!isEmpty(status) ? { status } : null),
    })
    return paginate(queryBuilder, paginateOptions)
  }

  async findAll(dto: RoleListDto) {
    const { name, value, description, status } = dto
    return this.roleRepository
      .createQueryBuilder('role')
      .andWhere({
        ...(name ? { name: Like(`%${name}%`) } : null),
        ...(value ? { value: Like(`%${value}%`) } : null),
        ...(description ? { description: Like(`%${description}%`) } : null),
        ...(!isEmpty(status) ? { status } : null),
      })
      .getMany()
  }

  async update(id: number, { menuIds, ...data }: RoleUpdateDto) {
    await this.roleRepository.update(id, data)
    await this.entityManager.transaction(async (manager) => {
      const role = await this.roleRepository.findOne({ where: { id } })
      if (role) {
        // menuIds 为空时清空 sys_role_menu 表中的关联数据
        role.menus = menuIds?.length ? await this.menuRepository.findBy({ id: In(menuIds) }) : []
        await manager.save(role)
      }
    })
  }

  async delete(ids: number[]) {
    await this.roleRepository.delete(ids)
  }

  async checkUserByRoleIds(ids: number[]) {
    const exists = await this.userRepository.exists({ where: { roles: { id: In(ids) } } })
    if (exists) {
      throw new BadRequestException(ErrorEnum.NOT_REMOVE_ROLE_LINK_USER)
    }
    return exists
  }
}
