import {
  BusinessStatus,
  TelegramGroupBindingState,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
} from '@admin/database'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  CreateTelegramMemberDto,
  TelegramMemberListDto,
  UpdateTelegramMemberDto,
} from './telegram.dto'
import { assertMemberCapabilities, type TelegramCapability } from './telegram-policy'

@Injectable()
export class TelegramMemberService {
  constructor(
    @InjectRepository(TelegramGroupMemberEntity)
    private readonly members: Repository<TelegramGroupMemberEntity>,
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
  ) {}

  async list(tenantId: string, input: TelegramMemberListDto) {
    const [items, total] = await this.members.findAndCount({
      where: {
        tenantId,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        ...(input.telegramUserId ? { telegramUserId: input.telegramUserId } : {}),
        ...(input.role ? { role: input.role } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async create(tenantId: string, input: Omit<CreateTelegramMemberDto, 'tenantId'>) {
    const group = await this.requireActiveGroup(tenantId, input.groupId)
    assertMemberCapabilities(
      input.role,
      input.capabilities,
      group.capabilities as TelegramCapability[],
    )
    return this.members.save(
      this.members.create({
        ...input,
        tenantId,
        telegramUsername: input.telegramUsername ?? null,
        displayName: input.displayName ?? null,
        status: BusinessStatus.ACTIVE,
      }),
    )
  }

  async update(tenantId: string, id: string, input: UpdateTelegramMemberDto) {
    const member = await this.members.findOne({ where: { id, tenantId } })
    if (!member) throw new NotFoundException('群组成员不存在')
    const group = await this.requireActiveGroup(tenantId, member.groupId)
    const role = input.role ?? (member.role as CreateTelegramMemberDto['role'])
    const capabilities = input.capabilities ?? (member.capabilities as TelegramCapability[])
    assertMemberCapabilities(role, capabilities, group.capabilities as TelegramCapability[])
    Object.assign(member, input, { role, capabilities })
    return this.members.save(member)
  }

  async setStatus(tenantId: string, id: string, status: BusinessStatus) {
    const member = await this.members.findOne({ where: { id, tenantId } })
    if (!member) throw new NotFoundException('群组成员不存在')
    if (status === BusinessStatus.ACTIVE) {
      await this.requireActiveGroup(tenantId, member.groupId)
    }
    member.status = status
    return this.members.save(member)
  }

  async remove(tenantId: string, id: string) {
    const member = await this.members.findOne({ where: { id, tenantId } })
    if (!member) throw new NotFoundException('群组成员不存在')
    await this.members.remove(member)
  }

  private async requireActiveGroup(tenantId: string, groupId: string) {
    const group = await this.groups.findOne({
      where: { id: groupId, tenantId, bindingState: TelegramGroupBindingState.ACTIVE },
    })
    if (!group) throw new BadRequestException('群组未完成绑定或不属于当前所属单位')
    return group
  }
}
