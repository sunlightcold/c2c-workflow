import {
  BusinessStatus,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
} from '@admin/database'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { ILike, In, Repository } from 'typeorm'
import type { CreateTelegramBotDto, TelegramBotListDto, UpdateTelegramBotDto } from './telegram.dto'
import {
  assertBotCapabilities,
  type TelegramBotType,
  type TelegramCapability,
} from './telegram-policy'

@Injectable()
export class TelegramBotService {
  constructor(
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
  ) {}

  async list(tenantId: string, input: TelegramBotListDto) {
    const [items, total] = await this.bots.findAndCount({
      where: {
        tenantId,
        ...(input.name ? { name: ILike(`%${input.name}%`) } : {}),
        ...(input.code ? { code: ILike(`%${input.code}%`) } : {}),
        ...(input.status ? { status: input.status } : {}),
      },
      order: { createdAt: 'DESC' },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    })
    return {
      items: items.map((item) => ({
        ...item,
        tokenConfigured: true,
        webhookSecretConfigured: true,
      })),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async create(tenantId: string, input: Omit<CreateTelegramBotDto, 'tenantId'>) {
    assertBotCapabilities(input.botType, input.capabilities)
    const bot = await this.bots.save(
      this.bots.create({
        ...input,
        tenantId,
        language: input.language ?? 'zh-CN',
        webhookSecretRef: input.webhookSecretRef ?? null,
        webhookUrl: input.webhookUrl ?? null,
        description: input.description ?? null,
        paymentOrderRequireConfirmation: input.paymentOrderRequireConfirmation ?? true,
        batchSubmitRequireConfirmation: input.batchSubmitRequireConfirmation ?? true,
        status: BusinessStatus.ACTIVE,
      }),
    )
    return this.publicView(bot)
  }

  async update(tenantId: string, id: string, input: UpdateTelegramBotDto) {
    const bot = await this.bots
      .createQueryBuilder('bot')
      .addSelect(['bot.tokenRef', 'bot.webhookSecretRef'])
      .where('bot.id = :id AND bot."tenantId" = :tenantId', { id, tenantId })
      .getOne()
    if (!bot) throw new NotFoundException('机器人不存在')
    if (input.botType !== undefined || input.capabilities !== undefined) {
      assertBotCapabilities(
        (input.botType ?? bot.botType) as TelegramBotType,
        input.capabilities ?? (bot.capabilities as TelegramCapability[]),
      )
    }
    if (input.capabilities !== undefined) {
      const groups = await this.groups.find({
        where: {
          tenantId,
          botId: id,
          bindingState: In([
            TelegramGroupBindingState.PENDING,
            TelegramGroupBindingState.ACTIVE,
            TelegramGroupBindingState.PAUSED,
          ]),
        },
      })
      if (
        groups.some((group) =>
          group.capabilities.some(
            (capability) => !input.capabilities?.includes(capability as TelegramCapability),
          ),
        )
      )
        throw new ConflictException('机器人能力仍被群组使用，请先调整群组能力')
    }
    Object.assign(bot, {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tokenRef !== undefined ? { tokenRef: input.tokenRef } : {}),
      ...(input.webhookSecretRef !== undefined ? { webhookSecretRef: input.webhookSecretRef } : {}),
      ...(input.webhookUrl !== undefined ? { webhookUrl: input.webhookUrl } : {}),
      ...(input.language !== undefined ? { language: input.language } : {}),
      ...(input.capabilities !== undefined ? { capabilities: input.capabilities } : {}),
      ...(input.paymentOrderRequireConfirmation !== undefined
        ? { paymentOrderRequireConfirmation: input.paymentOrderRequireConfirmation }
        : {}),
      ...(input.batchSubmitRequireConfirmation !== undefined
        ? { batchSubmitRequireConfirmation: input.batchSubmitRequireConfirmation }
        : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    })
    return this.publicView(await this.bots.save(bot))
  }

  async setStatus(tenantId: string, id: string, status: BusinessStatus) {
    const bot = await this.bots.findOne({ where: { id, tenantId } })
    if (!bot) throw new NotFoundException('机器人不存在')
    bot.status = status
    return this.publicView(await this.bots.save(bot))
  }

  async remove(tenantId: string, id: string) {
    const bot = await this.bots.findOne({ where: { id, tenantId } })
    if (!bot) throw new NotFoundException('机器人不存在')
    if (await this.groups.existsBy({ tenantId, botId: id }))
      throw new ConflictException('机器人已有群组记录，只能停用')
    await this.bots.remove(bot)
  }

  private publicView(bot: TelegramBotEntity) {
    const { tokenRef: _tokenRef, webhookSecretRef: _webhookSecretRef, ...view } = bot
    return {
      ...view,
      tokenConfigured: Boolean(_tokenRef),
      webhookSecretConfigured: Boolean(_webhookSecretRef),
    }
  }
}
