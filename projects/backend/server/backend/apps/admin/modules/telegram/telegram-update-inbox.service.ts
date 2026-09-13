import {
  BusinessStatus,
  TelegramBotEntity,
  TelegramUpdateEventEntity,
  TelegramUpdateStatus,
} from '@admin/database'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

@Injectable()
export class TelegramUpdateInboxService {
  constructor(
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    @InjectRepository(TelegramUpdateEventEntity)
    private readonly updates: Repository<TelegramUpdateEventEntity>,
  ) {}

  async receive(
    botCode: string,
    webhookSecret: string | undefined,
    payload: Record<string, unknown>,
  ) {
    const bot = await this.bots
      .createQueryBuilder('bot')
      .addSelect('bot.webhookSecretRef')
      .where('bot.code = :botCode AND bot.status = :status', {
        botCode,
        status: BusinessStatus.ACTIVE,
      })
      .getOne()
    if (!bot) throw new NotFoundException('机器人不存在或已停用')
    if (bot.webhookSecretRef && webhookSecret !== this.resolveSecret(bot.webhookSecretRef))
      throw new ForbiddenException('Webhook Secret 校验失败')
    return this.enqueue(bot, payload)
  }

  async enqueue(bot: Pick<TelegramBotEntity, 'id' | 'tenantId'>, payload: Record<string, unknown>) {
    const updateId = payload.update_id
    if (typeof updateId !== 'number' || !Number.isSafeInteger(updateId) || updateId < 0)
      throw new ForbiddenException('Telegram Update ID 无效')
    const result = await this.updates
      .createQueryBuilder()
      .insert()
      .values({
        tenantId: bot.tenantId,
        botId: bot.id,
        updateId: String(updateId),
        payload: () => ':payload::jsonb',
        status: TelegramUpdateStatus.RECEIVED,
        lastError: null,
      })
      .setParameter('payload', JSON.stringify(payload))
      .orIgnore()
      .execute()
    return { accepted: (result.identifiers?.length ?? 0) > 0 }
  }

  private resolveSecret(reference: string) {
    if (!reference.startsWith('env://')) throw new ForbiddenException('Webhook Secret 引用不可用')
    const value = process.env[reference.slice('env://'.length)]
    if (!value) throw new ForbiddenException('Webhook Secret 未配置')
    return value
  }
}
