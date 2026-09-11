import { TelegramUpdateEventEntity, TelegramUpdateStatus } from '@admin/database'
import { Injectable } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import { DataSource } from 'typeorm'
import { TelegramRuntimeService } from './telegram-runtime.service'

@Injectable()
export class TelegramUpdateProcessorService {
  private polling = false

  constructor(
    private readonly dataSource: DataSource,
    private readonly runtime: TelegramRuntimeService,
  ) {}

  @Interval(1000)
  async poll(): Promise<void> {
    if (this.polling) return
    this.polling = true
    try {
      for (let count = 0; count < 10; count += 1) {
        if (!(await this.processNext())) break
      }
    } finally {
      this.polling = false
    }
  }

  async processNext(): Promise<boolean> {
    const event = await this.claimNext()
    if (!event) return false
    try {
      await this.runtime.handle(event)
      await this.finish(event.id, TelegramUpdateStatus.COMPLETED, null)
    } catch (error) {
      await this.finish(event.id, TelegramUpdateStatus.FAILED, this.safeError(error))
    }
    return true
  }

  async claimNext(): Promise<TelegramUpdateEventEntity | null> {
    return this.dataSource.transaction(async (manager) => {
      const [rows] = (await manager.query(
        `WITH candidate AS (
           SELECT id
           FROM telegram_update_event
           WHERE status = $1
           ORDER BY "createdAt", id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE telegram_update_event AS event
         SET status = $2, "updatedAt" = now(), "lastError" = NULL
         FROM candidate
         WHERE event.id = candidate.id
         RETURNING event.*`,
        [TelegramUpdateStatus.RECEIVED, TelegramUpdateStatus.PROCESSING],
      )) as [TelegramUpdateEventEntity[], number]
      return rows[0] ?? null
    })
  }

  async finish(
    id: string,
    status: TelegramUpdateStatus.COMPLETED | TelegramUpdateStatus.FAILED,
    lastError: string | null,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE telegram_update_event
       SET status = $2, "updatedAt" = now(), "lastError" = $3
       WHERE id = $1 AND status = $4`,
      [id, status, lastError, TelegramUpdateStatus.PROCESSING],
    )
  }

  private safeError(error: unknown): string {
    const message = error instanceof Error ? error.message : 'Telegram Update 处理失败'
    return message.replace(/bot\d+:[A-Za-z0-9_-]+/g, 'bot<REDACTED>').slice(0, 500)
  }
}
