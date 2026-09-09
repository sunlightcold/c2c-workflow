import { toPaginationParams } from '@/common/dto'
import { FileUtils, getConfig, md5 } from '@/common/utils'
import { SystemParamsKey } from '@/common/constants'
import {
  SysFileAccessEnum,
  SysStaticFileEntity,
  SysStaticTypeEnum,
  SysUserFileEntity,
} from '@admin/database'
import { ParamsService } from '@admin/modules/system/params'
import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectEntityManager, InjectRepository } from '@nestjs/typeorm'
import { unlinkSync, writeFileSync } from 'fs'
import { ensureFileSync } from 'fs-extra'
import { paginate } from 'nestjs-typeorm-paginate'
import { join } from 'path'
import { EntityManager, Like, Repository } from 'typeorm'
import { FilterUserFileDto } from './static.dto'

const staticDirName = getConfig('admin').staticDirName

@Injectable()
export class StaticService {
  private readonly logger = new Logger(StaticService.name)

  constructor(
    @InjectRepository(SysStaticFileEntity)
    private readonly staticFileRepository: Repository<SysStaticFileEntity>,
    @InjectRepository(SysUserFileEntity)
    private readonly userFileRepository: Repository<SysUserFileEntity>,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly paramsService: ParamsService,
  ) {}

  async filter(dto: FilterUserFileDto) {
    const {
      paginateOptions,
      params: { username, nickname },
    } = toPaginationParams(dto)
    const query = this.userFileRepository
      .createQueryBuilder('userFile')
      .leftJoinAndSelect('userFile.user', 'user')
      .leftJoinAndSelect('userFile.file', 'file')
      .select([
        'userFile.id',
        'user.id',
        'user.username',
        'user.nickname',
        'file.id',
        'file.path',
        'file.name',
        'file.ext',
        'file.size',
      ])
      .andWhere({
        ...(username && { user: { username: Like(`%${username}%`) } }),
        ...(nickname && { user: { nickname: Like(`%${nickname}%`) } }),
      })

    const result = await paginate<SysUserFileEntity>(query, paginateOptions)
    const items = await Promise.all(
      result.items.map(async (item) => ({
        ...item,
        file: item.file ? await this.withPublicUrl(item.file) : item.file,
      })),
    )
    return { ...result, items }
  }

  async uploadFile(params: {
    file: Express.Multer.File
    uid: number
    type: SysStaticTypeEnum
    access: SysFileAccessEnum
  }) {
    const { file, uid, type, access } = params
    const hash = md5(file.buffer)
    const { isUserLinked, staticFile } = await this.checkExists(uid, hash)

    // 文件未存在服务器
    if (!staticFile) {
      const { fileName, ext, path, size } = this.saveFile({
        uid,
        file,
        type,
        access,
      })
      return await this.entityManager.transaction(async (manager) => {
        const newStaticFile = await manager.save(SysStaticFileEntity, {
          name: fileName,
          path,
          ext,
          size,
          hash,
        })
        await manager.save(SysUserFileEntity, {
          type,
          user: { id: uid },
          access,
          file: newStaticFile,
        })
        return this.withPublicUrl(newStaticFile)
      })
    }

    // 文件已存在服务器，用户未关联文件
    if (!isUserLinked) {
      return await this.entityManager.transaction(async (manager) => {
        await manager.increment(SysStaticFileEntity, { id: staticFile.id }, 'refCount', 1)
        await manager.save(SysUserFileEntity, { type, user: { id: uid }, access, file: staticFile })
        return this.withPublicUrl(staticFile)
      })
    }

    return this.withPublicUrl(staticFile)
  }

  async checkExists(uid: number, hash: string) {
    const staticFile = await this.staticFileRepository.findOneBy({ hash })

    let userFile: SysUserFileEntity | null = null
    if (staticFile) {
      userFile = await this.userFileRepository.findOne({
        where: {
          user: { id: uid },
          file: { id: staticFile.id },
        },
      })
    }

    return {
      staticFile,
      isUserLinked: !!userFile,
      userFile,
    }
  }

  async deleteByPath(path: string) {
    const result = await this.staticFileRepository.delete({ path })
    if (result?.affected) {
      this.deleteStaticFile(path)
    }
  }

  async delete(id: number) {
    const userFile = await this.userFileRepository.findOne({
      where: { id },
      relations: ['file'],
    })
    if (!userFile) {
      throw new NotFoundException(`文件记录 ID:${id} 不存在`)
    }
    const staticFile = userFile.file

    await this.entityManager.transaction(async (manager) => {
      await manager.remove(userFile)
      // 减少物理文件引用计数
      const currentFile = await manager.findOne(SysStaticFileEntity, {
        where: { id: staticFile.id },
        lock: { mode: 'pessimistic_write' }, // 开启排他锁，防止并发删除冲突
      })
      if (currentFile) {
        if (currentFile.refCount <= 1) {
          await manager.remove(currentFile)
          this.deleteStaticFile(currentFile.path)
        } else {
          await manager.decrement(SysStaticFileEntity, { id: currentFile.id }, 'refCount', 1)
        }
      }
    })
  }

  saveFile(params: {
    uid: number
    file: Express.Multer.File
    type: SysStaticTypeEnum
    access: SysFileAccessEnum
  }) {
    const { uid, file, type, access } = params
    const { dirPath, fileName, ext, fullPath } = FileUtils.generateFilePath(
      uid,
      `${access}\\${type}`,
      file.originalname,
    )
    const absoluteFullPath = join(__dirname, '..', staticDirName, fullPath)
    ensureFileSync(absoluteFullPath)
    writeFileSync(absoluteFullPath, file.buffer)
    return {
      fileName,
      ext,
      dirPath,
      path: fullPath,
      size: file.size,
      type,
    }
  }

  deleteStaticFile(filePath: string) {
    const fullPath = join(__dirname, '..', staticDirName, filePath)
    try {
      unlinkSync(fullPath)
    } catch (err: unknown) {
      this.logger.error(
        `物理文件删除失败: ${fullPath}, error=${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  async getPublicUrl(filePath: string) {
    const staticServerUrl =
      (await this.paramsService.getValue(SystemParamsKey.StaticServerUrl)) ?? ''
    const normalizedPath = filePath.startsWith('/') ? filePath : `/${filePath}`
    return `${staticServerUrl.replace(/\/$/, '')}${normalizedPath}`
  }

  private async withPublicUrl<T extends SysStaticFileEntity>(
    file: T,
  ): Promise<T & { url: string }> {
    return {
      ...file,
      url: await this.getPublicUrl(file.path),
    }
  }
}
