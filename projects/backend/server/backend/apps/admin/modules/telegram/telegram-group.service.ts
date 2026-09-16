import { randomInt, createHash } from 'node:crypto'
import {
  BusinessStatus,
  MerchantEntity,
  PaymentSourceType,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
  TelegramGroupMemberEntity,
  TelegramSuperAdminEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, ILike, Repository } from 'typeorm'
import type {
  ApproveTelegramGroupDto,
  CreateTelegramGroupDto,
  TelegramGroupListDto,
  UpdateTelegramGroupDto,
} from './telegram.dto'
import { assertGroupCapabilities, type TelegramCapability } from './telegram-policy'
import { TelegramNotificationEvent } from './telegram-notification.service'

@Injectable()
export class TelegramGroupService {
  constructor(
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    @InjectRepository(MerchantEntity)
    private readonly merchants: Repository<MerchantEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async list(tenantId: string, input: TelegramGroupListDto) {
    const [items, total] = await this.groups.findAndCount({
      where: {
        tenantId,
        ...(input.botId ? { botId: input.botId } : {}),
        ...(input.merchantId ? { merchantId: input.merchantId } : {}),
        ...(input.name ? { name: ILike(`%${input.name}%`) } : {}),
        ...(input.bindingState ? { bindingState: input.bindingState } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return { items, total, page: input.page, pageSize: input.pageSize }
  }

  async createChallenge(tenantId: string, input: Omit<CreateTelegramGroupDto, 'tenantId'>) {
    await this.assertRelations(tenantId, input.botId, input.merchantId, input.capabilities)
    const verificationCode = randomInt(100000, 1000000).toString()
    const group = await this.groups.save(
      this.groups.create({
        ...input,
        tenantId,
        chatId: null,
        chatType: null,
        notificationEvents: input.notificationEvents ?? Object.values(TelegramNotificationEvent),
        notificationsEnabled: input.notificationsEnabled ?? true,
        bindingState: TelegramGroupBindingState.PENDING,
        verificationCodeHash: createHash('sha256').update(verificationCode).digest('hex'),
        verificationExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
        verifiedAt: null,
        description: input.description ?? null,
      }),
    )
    return { ...this.publicView(group), verificationCode }
  }

  async update(tenantId: string, id: string, input: UpdateTelegramGroupDto) {
    const group = await this.groups.findOne({ where: { id, tenantId } })
    if (!group) throw new NotFoundException('群组绑定不存在')
    const botId = input.botId ?? group.botId
    const merchantId = input.merchantId ?? group.merchantId
    const capabilities = input.capabilities ?? (group.capabilities as TelegramCapability[])
    const merchantChanged = input.merchantId !== undefined && input.merchantId !== group.merchantId
    await this.assertRelations(tenantId, botId, merchantId, capabilities, {
      requireActiveMerchant: merchantChanged,
    })
    Object.assign(group, {
      ...input,
      botId,
      merchantId,
      capabilities,
    })
    return this.publicView(await this.groups.save(group))
  }

  async approve(tenantId: string, id: string, input: Omit<ApproveTelegramGroupDto, 'tenantId'>) {
    const group = await this.groups
      .createQueryBuilder('group')
      .addSelect(['group.verificationCodeHash', 'group.verificationExpiresAt'])
      .where('group.id = :id AND group."tenantId" = :tenantId', { id, tenantId })
      .getOne()
    if (!group) throw new NotFoundException('群组绑定不存在')
    if (group.bindingState !== TelegramGroupBindingState.PENDING)
      throw new ConflictException('只有待验证群组可以审批')
    await this.assertRelations(
      tenantId,
      group.botId,
      group.merchantId,
      group.capabilities as TelegramCapability[],
    )
    group.chatId = input.chatId
    group.chatType = input.chatType ?? 'supergroup'
    group.name = input.chatName ?? group.name
    group.bindingState = TelegramGroupBindingState.ACTIVE
    group.verifiedAt = new Date()
    group.verificationCodeHash = null
    group.verificationExpiresAt = null
    return this.publicView(await this.groups.save(group))
  }

  async bindByMerchant(input: {
    tenantId: string
    botId: string
    merchantCode: string
    chatId: string
    chatType: string
    chatName?: string | null
  }) {
    if (input.chatType !== 'group' && input.chatType !== 'supergroup')
      throw new BadRequestException('只能在群组中绑定商家')
    const merchantIdentifier = input.merchantCode.trim()
    const [merchant, bot] = await Promise.all([
      this.merchants.findOne({
        where: [
          {
            tenantId: input.tenantId,
            externalMerchantId: merchantIdentifier,
            status: BusinessStatus.ACTIVE,
          },
          {
            tenantId: input.tenantId,
            code: merchantIdentifier.toUpperCase(),
            status: BusinessStatus.ACTIVE,
          },
        ],
      }),
      this.bots.findOne({
        where: { id: input.botId, tenantId: input.tenantId, status: BusinessStatus.ACTIVE },
      }),
    ])
    if (!merchant) throw new BadRequestException('商家不存在或已停用')
    if (!bot) throw new BadRequestException('机器人不可用或不属于当前所属单位')

    const existing = await this.groups.findOne({
      where: {
        tenantId: input.tenantId,
        botId: input.botId,
        chatId: input.chatId,
        bindingState: TelegramGroupBindingState.ACTIVE,
      },
    })
    if (existing) throw new ConflictException('当前群已经完成绑定')

    const pending = await this.groups.findOne({
      where: {
        tenantId: input.tenantId,
        botId: input.botId,
        merchantId: merchant.id,
        bindingState: TelegramGroupBindingState.PENDING,
      },
      order: { createdAt: 'DESC' },
    })
    const group =
      pending ??
      this.groups.create({
        tenantId: input.tenantId,
        botId: input.botId,
        merchantId: merchant.id,
        name: input.chatName?.trim().slice(0, 100) || merchant.name,
        chatId: null,
        chatType: null,
        paymentScene: PaymentSourceType.C2C_BUY,
        capabilities: bot.capabilities,
        notificationEvents: Object.values(TelegramNotificationEvent),
        notificationsEnabled: true,
        bindingState: TelegramGroupBindingState.PENDING,
        verificationCodeHash: null,
        verificationExpiresAt: null,
        verifiedAt: null,
        description: null,
      })
    group.chatId = input.chatId
    group.chatType = input.chatType
    if (input.chatName?.trim()) group.name = input.chatName.trim().slice(0, 100)
    group.bindingState = TelegramGroupBindingState.ACTIVE
    group.verifiedAt = new Date()
    group.verificationCodeHash = null
    group.verificationExpiresAt = null
    const savedGroup = await this.groups.save(group)
    merchant.botCode = bot.code
    merchant.chatId = input.chatId
    await this.merchants.save(merchant)
    return this.publicView(savedGroup)
  }

  async unbind(tenantId: string, id: string) {
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.findOne(TelegramGroupEntity, {
        where: { id, tenantId },
        lock: { mode: 'pessimistic_write' },
      })
      if (!group) throw new NotFoundException('群组绑定不存在')
      group.bindingState = TelegramGroupBindingState.UNBOUND
      group.notificationsEnabled = false
      await manager.update(
        TelegramGroupMemberEntity,
        { tenantId, groupId: id },
        { status: BusinessStatus.DISABLED },
      )
      const superAdmins = await manager.find(TelegramSuperAdminEntity, { where: { tenantId } })
      for (const admin of superAdmins) {
        if (admin.groupIds.includes(id)) {
          admin.groupIds = admin.groupIds.filter((groupId) => groupId !== id)
          await manager.save(admin)
        }
      }
      return this.publicView(await manager.save(group))
    })
  }

  private async assertRelations(
    tenantId: string,
    botId: string,
    merchantId: string,
    capabilities: readonly TelegramCapability[],
    options: { requireActiveMerchant?: boolean } = {},
  ) {
    const merchantWhere = {
      id: merchantId,
      tenantId,
      ...(options.requireActiveMerchant === false ? {} : { status: BusinessStatus.ACTIVE }),
    }
    const [bot, merchant] = await Promise.all([
      this.bots.findOne({ where: { id: botId, tenantId, status: BusinessStatus.ACTIVE } }),
      this.merchants.findOne({ where: merchantWhere }),
    ])
    if (!bot) throw new BadRequestException('机器人不可用或不属于当前所属单位')
    if (!merchant) throw new BadRequestException('商家不可用或不属于当前所属单位')
    assertGroupCapabilities(bot.capabilities as TelegramCapability[], capabilities)
  }

  private publicView(group: TelegramGroupEntity) {
    const {
      verificationCodeHash: _verificationCodeHash,
      verificationExpiresAt: _verificationExpiresAt,
      ...view
    } = group
    return view
  }
}
