import { StatusEnum } from '@/common/interfaces'
import { getConfig, getSaltMD5 } from '@/common/utils'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { v4 } from 'uuid'
import { SysUserEntity } from './database'

@Injectable()
export class InitService implements OnModuleInit {
  private readonly logger = new Logger(InitService.name)

  constructor(
    @InjectRepository(SysUserEntity)
    private readonly userRepository: Repository<SysUserEntity>,
  ) {}

  async onModuleInit() {
    await this.initSuperAdmin()
  }

  /**
   * 初始化超级管理员
   */
  async initSuperAdmin() {
    const { superAdminUid, superAdminName, superAdminPassword } = getConfig('common')
    const exists = await this.userRepository.exists({ where: { id: superAdminUid } })
    if (!exists) {
      const salt = v4()
      const password = getSaltMD5(superAdminPassword, salt)
      const user = this.userRepository.create({
        id: superAdminUid,
        username: superAdminName,
        password,
        salt,
        status: StatusEnum.ENABLED,
      })
      await this.userRepository.save(user)
      this.logger.log('初始化超级管理员成功')
    }
  }
}
