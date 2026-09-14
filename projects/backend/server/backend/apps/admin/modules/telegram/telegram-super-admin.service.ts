import {
  BusinessStatus,
  TelegramGroupBindingState,
  TelegramGroupEntity,
  TelegramSuperAdminEntity,
  TelegramSuperAdminScopeType,
} from '@admin/database'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type {
  CreateTelegramSuperAdminDto,
  TelegramSuperAdminListDto,
  UpdateTelegramSuperAdminDto,
} from './telegram.dto'

@Injectable()
export class TelegramSuperAdminService {
  constructor(
    @InjectRepository(TelegramSuperAdminEntity)
    private readonly superAdmins: Repository<TelegramSuperAdminEntity>,
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
  ) {}

  async list(tenantId: string, input: TelegramSuperAdminListDto) {
    const [items, total] = await this.superAdmins.findAndCount({
      where: {
        tenantId,
        ...(input.telegramUserId ? { telegramUserId: input.telegramUserId } : {}),
        ...(input.scopeType ? { scopeType: input.scopeType } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async create(tenantId: string, input: Omit<CreateTelegramSuperAdminDto, 'tenantId'>) {
    await this.assertScope(tenantId, input.scopeType, input.groupIds)
    return this.superAdmins.save(
      this.superAdmins.create({
        ...input,
        tenantId,
        telegramUsername: input.telegramUsername ?? null,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }

  async update(tenantId: string, id: string, input: UpdateTelegramSuperAdminDto) {
    const admin = await this.superAdmins.findOne({ where: { id, tenantId } })
    if (!admin) throw new NotFoundException('Telegram 超级管理员不存在')
    const scopeType = input.scopeType ?? admin.scopeType
    const groupIds = input.groupIds ?? admin.groupIds
    await this.assertScope(tenantId, scopeType, groupIds)
    Object.assign(admin, input, { scopeType, groupIds })
    return this.superAdmins.save(admin)
  }

  async setStatus(tenantId: string, id: string, status: BusinessStatus) {
    const admin = await this.superAdmins.findOne({ where: { id, tenantId } })
    if (!admin) throw new NotFoundException('Telegram 超级管理员不存在')
    admin.status = status
    return this.superAdmins.save(admin)
  }

  async remove(tenantId: string, id: string) {
    const admin = await this.superAdmins.findOne({ where: { id, tenantId } })
    if (!admin) throw new NotFoundException('Telegram 超级管理员不存在')
    await this.superAdmins.remove(admin)
  }

  private async assertScope(
    tenantId: string,
    scopeType: TelegramSuperAdminScopeType,
    groupIds: string[],
  ) {
    if (scopeType === TelegramSuperAdminScopeType.ALL_GROUPS) {
      if (groupIds.length) throw new BadRequestException('全部群组范围不能同时指定群组')
      return
    }
    if (!groupIds.length) throw new BadRequestException('指定群组范围至少选择一个群组')
    const count = await this.groups.countBy({
      id: In(groupIds),
      tenantId,
      bindingState: TelegramGroupBindingState.ACTIVE,
    })
    if (count !== groupIds.length)
      throw new BadRequestException('存在未绑定群组或群组不属于当前所属单位')
  }
}
