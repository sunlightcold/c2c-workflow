import { BusinessStatus, TelegramBotEntity } from '@admin/database'
import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { TelegramApiClient, TelegramBotProfile } from './telegram-api.client'
import { TelegramUpdateInboxService } from './telegram-update-inbox.service'

export type TelegramConnectionState = 'ONLINE' | 'CONNECTING' | 'NOT_STARTED' | 'DISABLED' | 'ERROR'

export interface TelegramBotRuntimeStatus {
  state: TelegramConnectionState
  runtimeRunning: boolean
  checkedAt: string
  message: string
  telegramId?: number
  telegramUsername?: string
  lastUpdateAt?: string
}

@Injectable()
export class TelegramBotRuntimeService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotRuntimeService.name)
  private readonly statuses = new Map<string, TelegramBotRuntimeStatus>()
  private readonly offsets = new Map<string, number>()
  private readonly generations = new Map<string, number>()
  private readonly loops = new Map<string, Promise<void>>()
  private readonly controllers = new Map<string, AbortController>()
  private nextGeneration = 0

  constructor(
    @InjectRepository(TelegramBotEntity)
    private readonly bots: Repository<TelegramBotEntity>,
    private readonly telegram: TelegramApiClient,
    private readonly inbox: TelegramUpdateInboxService,
  ) {}

  onApplicationBootstrap() {
    this.startActiveBots().catch((error) =>
      this.logger.error(
        '机器人运行时启动协调失败',
        error instanceof Error ? error.stack : String(error),
      ),
    )
  }

  async onModuleDestroy() {
    this.generations.clear()
    for (const controller of this.controllers.values()) controller.abort()
    await Promise.allSettled(this.loops.values())
    this.loops.clear()
    this.controllers.clear()
    this.statuses.clear()
    this.offsets.clear()
  }

  getStatus(code: string): TelegramBotRuntimeStatus {
    return (
      this.statuses.get(code) ?? {
        state: 'NOT_STARTED',
        runtimeRunning: false,
        checkedAt: new Date().toISOString(),
        message: '机器人尚未启动',
      }
    )
  }

  getStatuses() {
    return Object.fromEntries(this.statuses.entries()) as Record<string, TelegramBotRuntimeStatus>
  }

  async start(tenantId: string, id: string) {
    const bot = await this.findBot(tenantId, id)
    if (!bot) return this.statusForMissing()
    if (bot.status !== BusinessStatus.ACTIVE) {
      return this.setStatus(bot.code, 'DISABLED', false, '机器人配置已停用')
    }
    if (this.generations.has(bot.code)) return this.getStatus(bot.code)
    await this.bots.update({ id, tenantId }, { runtimeEnabled: true })
    const generation = ++this.nextGeneration
    const controller = new AbortController()
    this.generations.set(bot.code, generation)
    this.controllers.set(bot.code, controller)
    this.setStatus(bot.code, 'CONNECTING', true, '正在连接 Telegram')
    const running = this.run(bot, generation, controller.signal)
    const loop = running.finally(() => {
      if (this.loops.get(bot.code) === loop) this.loops.delete(bot.code)
      if (this.generations.get(bot.code) === generation) this.generations.delete(bot.code)
      if (this.controllers.get(bot.code) === controller) this.controllers.delete(bot.code)
    })
    this.loops.set(bot.code, loop)
    return this.getStatus(bot.code)
  }

  async stop(tenantId: string, id: string) {
    const bot = await this.findBot(tenantId, id)
    if (!bot) return this.statusForMissing()
    await this.bots.update({ id, tenantId }, { runtimeEnabled: false })
    await this.stopLoop(bot.code)
    return this.setStatus(bot.code, 'NOT_STARTED', false, '机器人已停止')
  }

  async restart(tenantId: string, id: string) {
    const bot = await this.findBot(tenantId, id)
    if (!bot) return this.statusForMissing()
    await this.stopLoop(bot.code)
    return this.start(tenantId, id)
  }

  async reloadIfRunning(tenantId: string, id: string) {
    const bot = await this.findBot(tenantId, id)
    if (!bot) return this.statusForMissing()
    if (!this.generations.has(bot.code)) return this.getStatus(bot.code)
    return this.restart(tenantId, id)
  }

  async check(tenantId: string, id: string) {
    const bot = await this.findBot(tenantId, id)
    if (!bot) return this.statusForMissing()
    if (bot.status !== BusinessStatus.ACTIVE) {
      return this.setStatus(bot.code, 'DISABLED', false, '机器人配置已停用')
    }
    try {
      const profile = await this.telegram.getMe(bot.tokenRef)
      return this.setOnline(bot.code, this.generations.has(bot.code), profile)
    } catch (error) {
      return this.setStatus(
        bot.code,
        'ERROR',
        this.generations.has(bot.code),
        this.errorMessage(error),
      )
    }
  }

  async stopByCode(code: string) {
    await this.stopLoop(code)
    return this.setStatus(code, 'NOT_STARTED', false, '机器人已停止')
  }

  private async startActiveBots() {
    const active = await this.bots.find({
      where: { status: BusinessStatus.ACTIVE, runtimeEnabled: true },
    })
    for (const bot of active) {
      this.start(bot.tenantId, bot.id).catch((error) =>
        this.logger.error(
          `机器人 ${bot.code} 启动失败`,
          error instanceof Error ? error.stack : String(error),
        ),
      )
    }
  }

  private async run(bot: TelegramBotEntity, generation: number, signal: AbortSignal) {
    try {
      const profile = await this.telegram.getMe(bot.tokenRef)
      await this.telegram.deleteWebhook(bot.tokenRef)
      this.setOnline(bot.code, true, profile)
      while (this.generations.get(bot.code) === generation) {
        const updates = await this.telegram.getUpdates(
          bot.tokenRef,
          this.offsets.get(bot.code),
          signal,
        )
        for (const update of updates) {
          if (this.generations.get(bot.code) !== generation) break
          this.offsets.set(bot.code, update.update_id + 1)
          await this.inbox.enqueue(bot, update)
          const current = this.getStatus(bot.code)
          this.statuses.set(bot.code, { ...current, lastUpdateAt: new Date().toISOString() })
        }
      }
    } catch (error) {
      if (this.generations.get(bot.code) === generation) {
        this.setStatus(bot.code, 'ERROR', false, this.errorMessage(error))
        this.logger.error(
          `机器人 ${bot.code} 运行失败`,
          error instanceof Error ? error.stack : String(error),
        )
      }
    }
  }

  private async stopLoop(code: string) {
    const loop = this.loops.get(code)
    this.generations.delete(code)
    this.controllers.get(code)?.abort()
    if (loop) await loop
  }

  private async findBot(tenantId: string, id: string) {
    return this.bots
      .createQueryBuilder('bot')
      .addSelect('bot.tokenRef')
      .where('bot.id = :id AND bot."tenantId" = :tenantId', { id, tenantId })
      .getOne()
  }

  private statusForMissing(): TelegramBotRuntimeStatus {
    return {
      state: 'ERROR',
      runtimeRunning: false,
      checkedAt: new Date().toISOString(),
      message: '机器人不存在',
    }
  }

  private setOnline(code: string, runtimeRunning: boolean, profile: TelegramBotProfile) {
    return this.setStatus(
      code,
      'ONLINE',
      runtimeRunning,
      runtimeRunning ? 'Telegram 连接正常，机器人正在运行' : 'Telegram 连接正常，但运行时未启动',
      profile,
    )
  }

  private setStatus(
    code: string,
    state: TelegramConnectionState,
    runtimeRunning: boolean,
    message: string,
    profile?: TelegramBotProfile,
  ) {
    const status: TelegramBotRuntimeStatus = {
      state,
      runtimeRunning,
      checkedAt: new Date().toISOString(),
      message,
      ...(profile?.id === undefined ? {} : { telegramId: profile.id }),
      ...(profile?.username ? { telegramUsername: profile.username } : {}),
    }
    this.statuses.set(code, status)
    return status
  }

  private errorMessage(error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/401|unauthorized|token/i.test(message)) return 'Telegram Token 无效或已失效'
    if (/409|conflict|getUpdates/i.test(message)) return 'Telegram 长轮询被其他实例占用'
    if (/timeout|network|ECONN|ENOTFOUND|aborted/i.test(message)) return 'Telegram 网络连接失败'
    return 'Telegram 连接失败'
  }
}
