import { SysRoleEntity, SysUserEntity } from '@/apps/admin/database'
import { ErrorEnum } from '@/common/constants'
import { toPaginationParams } from '@/common/dto'
import { StatusEnum } from '@/common/interfaces'
import { getConfig, getSaltMD5, isArray, validateOtpSecretToken } from '@/common/utils'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { isNotEmpty } from 'class-validator'
import { paginate } from 'nestjs-typeorm-paginate'
import { EntityManager, In, Like, Repository } from 'typeorm'
import { v4 as uuidv4 } from 'uuid'
import { UserCreateDto, UserFilterDto, UserUpdateDto } from './user.dto'

@Injectable()
export class UserService {
  @InjectRepository(SysUserEntity) private readonly userRepository: Repository<SysUserEntity>
  @InjectRepository(SysRoleEntity) private readonly roleRepository: Repository<SysRoleEntity>
  @InjectEntityManager() private readonly entityManager: EntityManager

  async create(dto: UserCreateDto) {
    const { password, roleIds, ...data } = dto
    const salt = uuidv4()
    const savePassword = getSaltMD5(password, salt)
    const roles = await this.roleRepository.findBy({ id: In(roleIds ?? []) })
    const user = await this.userRepository.save({
      ...data,
      salt,
      roles,
      password: savePassword,
    })
    return { uid: user.id }
  }

  async filter(dto: UserFilterDto) {
    const { params, paginateOptions } = toPaginationParams(dto)
    const { nickname, status, description, username } = params
    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .andWhere({
        ...(username ? { username: Like(`%${username}%`) } : null),
        ...(nickname ? { nickname: Like(`%${nickname}%`) } : null),
        ...(description ? { description: Like(`%${description}%`) } : null),
        ...(isNotEmpty(status) ? { status } : null),
      })
      .leftJoinAndSelect('user.roles', 'roles')
      .select([
        'user.id',
        'user.username',
        'user.nickname',
        'user.description',
        'user.status',
        'user.avatar',
        'user.createdAt',
        'user.updatedAt',
        'roles.id',
        'roles.name',
        'roles.value',
      ])
    return paginate(queryBuilder, paginateOptions)
  }

  async findUserById(id: number) {
    const user = await this.userRepository.findOneBy({ id })
    if (!user) throw new BadRequestException('用户不存在')
    return user
  }

  async getInfo(id: number) {
    const user = await this.userRepository.findOneBy({ id })
    if (user) {
      Reflect.deleteProperty(user, 'password')
      Reflect.deleteProperty(user, 'salt')
      Reflect.deleteProperty(user, 'otpSecret')
      return user
    }
    throw new NotFoundException('用户不存在')
  }

  async findOneByUsername(username: string) {
    const user = await this.userRepository.findOneBy({ username })
    return user
  }

  async findOneByEmail(email: string) {
    return await this.userRepository.findOneBy({ email })
  }

  async updateEmail(id: number, email: string) {
    await this.userRepository.update(id, { email })
  }

  async update(id: number, dto: UserUpdateDto) {
    await this.entityManager.transaction(async (manager) => {
      const { roleIds, ...data } = dto
      await manager.update(SysUserEntity, id, data)
      const user = await this.userRepository.findOne({ where: { id }, relations: ['roles'] })
      if (!user) return
      // 更新和移除关联角色
      if (isArray(roleIds)) {
        await manager
          .createQueryBuilder()
          .relation(SysUserEntity, 'roles')
          .of(id)
          .addAndRemove(roleIds, user.roles)
      }
      if (user.status === StatusEnum.ENABLED) {
        // await this.forbidden(id)
      }
    })
  }

  async updateOtpSecret(id: number, otpSecret: string) {
    await this.userRepository.update(id, { otpSecret, isOtpEnabled: true })
  }

  async disabledOtp(id: number) {
    await this.userRepository.update(id, { otpSecret: '', isOtpEnabled: false })
  }

  async checkUserOtpSecret(id: number, code: string) {
    const user = await this.checkUserBoundOtpSecret(id)
    const flag = validateOtpSecretToken(code, user.otpSecret!)
    if (!flag) throw new BadRequestException('验证码错误')
    return user
  }

  async checkUserBoundOtpSecret(id: number) {
    const user = await this.findUserById(id)
    if (!user.isOtpEnabled) throw new BadRequestException('未绑定验证器')
    return user
  }

  async remove(id: number) {
    await this.userRepository.delete(id)
  }

  async checkUsernameExist(username: string) {
    return await this.userRepository.existsBy({ username })
  }

  async getRoleIdsByUserId(id: number) {
    const user = await this.userRepository.findOne({ where: { id }, select: ['roles'] })
    return user?.roles.map((role) => role.id) ?? []
  }

  async getUserIdsByRoleIds(ids: number[]) {
    const users = await this.userRepository
      .createQueryBuilder('user')
      .andWhere({ roles: { id: In(ids) } })
      .select(['user.id'])
      .getMany()
    return users.map((user) => user.id)
  }

  async checkAdminUserDelete(id: number) {
    const user = await this.findUserById(id)
    if (!user) throw new BadRequestException(ErrorEnum.INVALID_USER)
    if (getConfig('common').superAdminUid === user.id) {
      throw new BadRequestException(ErrorEnum.INVALID_SUPER_ADMIN_DELETE)
    }
    return true
  }

  async modifyPwd(id: number, newPwd: string) {
    await this.userRepository.update(id, { password: newPwd })
  }
}
