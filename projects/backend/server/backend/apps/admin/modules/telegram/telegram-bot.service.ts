import {
  BusinessStatus,
  TelegramBotEntity,
  TelegramGroupBindingState,
  TelegramGroupEntity,
} from '@admin/database'
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { BusinessNoPrefix, IdUtils } from '@/common/utils/id'
import { CredentialCipherService } from '../system/credential/credential-cipher.service'
import type { CreateTelegramBotDto, TelegramBotListDto, UpdateTelegramBotDto } from './telegram.dto'
import {
  assertBotCapabilities,
  type TelegramBotType,
  type TelegramCapability,
} from './telegram-policy'

type TelegramBotCreateInput = Omit<CreateTelegramBotDto, 'tenantId' | 'token'> & {
  token?: string
  /** @deprecated 仅兼容历史内部调用。 */
  tokenRef?: string
}
type TelegramBotUpdateInput = UpdateTelegramBotDto & {
  /** @deprecated 仅兼容历史内部调用。 */
  tokenRef?: string
}

@Injectable()
export class TelegramBotService {
  constructor(
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    @InjectRepository(TelegramGroupEntity)
    private readonly groups: Repository<TelegramGroupEntity>,
    @Optional() private readonly cipher?: CredentialCipherService,
  ) {}

  async list(tenantId: string, input: TelegramBotListDto) {
    const query = this.bots
      .createQueryBuilder('bot')
      .addSelect('bot.tokenRef')
      .where('bot."tenantId" = :tenantId', { tenantId })
    if (input.name) query.andWhere('bot.name ILIKE :name', { name: `%${input.name}%` })
    if (input.code) query.andWhere('bot.code ILIKE :code', { code: `%${input.code}%` })
    if (input.status) query.andWhere('bot.status = :status', { status: input.status })
    const [items, total] = await query
      .orderBy('bot.createdAt', 'DESC')
      .skip((input.page - 1) * input.pageSize)
      .take(input.pageSize)
      .getManyAndCount()
    return {
      items: items.map((item) => this.publicView(item)),
      total,
      page: input.page,
      pageSize: input.pageSize,
    }
  }

  async create(tenantId: string, input: TelegramBotCreateInput) {
    assertBotCapabilities(input.botType, input.capabilities)
    const tokenRef = this.toTokenReference(input.token, input.tokenRef)
    const bot = await this.bots.save(
      this.bots.create({
        tenantId,
        code: IdUtils.generateBusinessNo(BusinessNoPrefix.TELEGRAM_BOT),
        name: input.name,
        botType: input.botType,
        tokenRef,
        language: input.language ?? 'zh-CN',
        webhookSecretRef: null,
        webhookUrl: null,
        capabilities: input.capabilities,
        description: input.description ?? null,
        paymentOrderRequireConfirmation: input.paymentOrderRequireConfirmation ?? true,
        batchSubmitRequireConfirmation: input.batchSubmitRequireConfirmation ?? true,
        status: BusinessStatus.ACTIVE,
        runtimeEnabled: true,
      }),
    )
    return this.publicView(bot)
  }

  async update(tenantId: string, id: string, input: TelegramBotUpdateInput) {
    const bot = await this.bots
      .createQueryBuilder('bot')
      .addSelect('bot.tokenRef')
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
      ...(input.token !== undefined || input.tokenRef !== undefined
        ? { tokenRef: this.toTokenReference(input.token, input.tokenRef) }
        : {}),
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
    return bot.code
  }

  private publicView(bot: TelegramBotEntity) {
    const {
      tokenRef: _tokenRef,
      webhookSecretRef: _webhookSecretRef,
      webhookUrl: _webhookUrl,
      ...view
    } = bot
    return {
      ...view,
      tokenConfigured: Boolean(_tokenRef),
    }
  }

  private toTokenReference(token?: string, legacyReference?: string): string {
    const value = token?.trim() || legacyReference?.trim()
    if (!value) throw new BadRequestException('请输入 Telegram Bot Token')
    if (value.startsWith('env://') || value.startsWith('enc://')) return value
    if (!this.cipher) throw new BadRequestException('机器人凭据加密服务不可用')
    return `enc://${this.cipher.encrypt(value)}`
  }
}
