import {
  TelegramInteractionAction,
  TelegramInteractionContextEntity,
  TelegramInteractionState,
} from '@admin/database'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'

interface CreateTelegramInteractionInput {
  botId: string
  chatId: string
  groupId: string
  payload: Record<string, unknown>
  sourceMessageId: number
  telegramUserId: string
  tenantId: string
}

interface AcquireTelegramInteractionInput {
  botId: string
  chatId: string
  id: string
  telegramUserId: string
}

@Injectable()
export class TelegramInteractionService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TelegramInteractionContextEntity)
    private readonly interactions: Repository<TelegramInteractionContextEntity>,
  ) {}

  create(input: CreateTelegramInteractionInput) {
    const interaction = this.interactions.create({
      ...input,
      action: TelegramInteractionAction.CREATE_MANUAL_PAYMENTS,
      state: TelegramInteractionState.PENDING,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      lastError: null,
    })
    return this.interactions.save(interaction)
  }

  async acquire(input: AcquireTelegramInteractionInput) {
    const [rows] = (await this.dataSource.query(
      `UPDATE telegram_interaction_context
       SET state = $5, "updatedAt" = now()
       WHERE id = $1 AND "botId" = $2 AND "chatId" = $3 AND "telegramUserId" = $4
         AND (state = $6 OR (state = $5 AND "updatedAt" < now() - interval '5 minutes'))
         AND "expiresAt" > now()
       RETURNING *`,
      [
        input.id,
        input.botId,
        input.chatId,
        input.telegramUserId,
        TelegramInteractionState.SUBMITTING,
        TelegramInteractionState.PENDING,
      ],
    )) as [TelegramInteractionContextEntity[], number]
    return rows[0] ?? null
  }

  async complete(
    id: string,
    state: TelegramInteractionState.COMPLETED | TelegramInteractionState.FAILED,
    lastError: string | null,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE telegram_interaction_context
       SET state = $2, "updatedAt" = now(), "lastError" = $3
       WHERE id = $1 AND state = $4`,
      [id, state, lastError, TelegramInteractionState.SUBMITTING],
    )
  }

  async cancel(input: AcquireTelegramInteractionInput): Promise<boolean> {
    const [, count] = (await this.dataSource.query(
      `UPDATE telegram_interaction_context
       SET state = $5, "updatedAt" = now()
       WHERE id = $1 AND "botId" = $2 AND "chatId" = $3 AND "telegramUserId" = $4
         AND state = $6`,
      [
        input.id,
        input.botId,
        input.chatId,
        input.telegramUserId,
        TelegramInteractionState.CANCELLED,
        TelegramInteractionState.PENDING,
      ],
    )) as [unknown[], number]
    return count > 0
  }
}
