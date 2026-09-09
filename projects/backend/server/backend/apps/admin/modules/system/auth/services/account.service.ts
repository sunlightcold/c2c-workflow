import {
  SysFileAccessEnum,
  SysStaticTypeEnum,
  SysUserEntity,
  SysUserFileEntity,
} from '@/apps/admin/database'
import { StaticService } from '@admin/modules/static'
import { Inject, Injectable } from '@nestjs/common'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository } from 'typeorm'
import { AccountUpdateDto } from '../dto'

@Injectable()
export class AccountService {
  @Inject(StaticService) private readonly staticService: StaticService

  @InjectRepository(SysUserFileEntity)
  private readonly userFileRepository: Repository<SysUserFileEntity>

  @InjectRepository(SysUserEntity)
  private readonly userRepository: Repository<SysUserEntity>

  @InjectEntityManager() private readonly entityManager: EntityManager

  async uploadAvatar(uid: number, file: Express.Multer.File) {
    const result = await this.staticService.uploadFile({
      file,
      uid,
      type: SysStaticTypeEnum.AVATAR,
      access: SysFileAccessEnum.PUBLIC,
    })
    await this.userRepository.update(uid, { avatar: result.url })
    // 上传成功后删除旧头像文件
    await this.entityManager.transaction(async (manager) => {
      const userAvatars = await manager
        .createQueryBuilder(SysUserFileEntity, 'userFile')
        .innerJoinAndSelect('userFile.file', 'file')
        .where('userFile.userId = :uid', { uid })
        .andWhere('userFile.type = :type', { type: SysStaticTypeEnum.AVATAR })
        .andWhere('NOT (file.id = :resultId AND file.refCount = 1)', {
          resultId: result.id,
        })
        .getMany()
      const ids = userAvatars.map((item) => item.id)
      for (const id of ids) {
        await this.staticService.delete(id)
      }
    })
    return {
      avatar: result.url,
    }
  }

  async updateInfo(uid: number, dto: AccountUpdateDto) {
    await this.userRepository.update(uid, dto)
  }
}
