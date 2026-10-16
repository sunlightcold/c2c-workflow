import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Interval } from '@nestjs/schedule'
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets'
import { plainToInstance } from 'class-transformer'
import { validateSync } from 'class-validator'
import type { Subscription } from 'rxjs'
import type { Socket } from 'socket.io'
import { SkipResponseInterceptor } from '@/common/interceptors/response.interceptor'
import { IJwtService } from '../system/auth/services/jwt.service'
import { ChatAccessService } from './chat-access.service'
import type { ChatEvent } from './chat.types'
import { ChatLiveDto } from './merchant-chat.dto'
import { MerchantChatService } from './merchant-chat.service'

interface LiveSubscription {
  socket: Socket
  tenantId: string
  merchantId?: string
  queue: Promise<void>
  queued: number
}
@Injectable()
@WebSocketGateway({ transports: ['websocket', 'polling'], cors: { origin: '*' } })
export class MerchantChatGateway implements OnModuleInit, OnModuleDestroy, OnGatewayDisconnect {
  private readonly clients = new Map<string, LiveSubscription>()
  private events: Subscription
  constructor(
    private readonly chat: MerchantChatService,
    private readonly access: ChatAccessService,
    private readonly jwt: IJwtService,
  ) {}
  onModuleInit() {
    this.events = this.chat.memory.events.subscribe((event) => this.publish(event))
  }
  onModuleDestroy() {
    this.events.unsubscribe()
    this.clients.clear()
  }
  handleDisconnect(socket: Socket) {
    this.clients.delete(socket.id)
    delete socket.data.chatSubscriptionVersion
  }
  @SubscribeMessage('merchant-chat.unsubscribe')
  @SkipResponseInterceptor()
  unsubscribe(@ConnectedSocket() socket: Socket) {
    this.clients.delete(socket.id)
    delete socket.data.chatSubscriptionVersion
    return { ok: true }
  }
  @SubscribeMessage('merchant-chat.subscribe')
  @SkipResponseInterceptor()
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() payload: unknown) {
    const version = Symbol('chat-subscription')
    socket.data.chatSubscriptionVersion = version
    this.clients.delete(socket.id)
    try {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('invalid')
      const dto = plainToInstance(ChatLiveDto, payload)
      if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length)
        throw new Error('invalid')
      const tenantId = await this.authorize(socket, dto.tenantId)
      if (!socket.connected || socket.data.chatSubscriptionVersion !== version) return { ok: false }
      if (!this.clients.has(socket.id) && this.clients.size >= 256) throw new Error('capacity')
      const subscription: LiveSubscription = {
        socket,
        tenantId,
        merchantId: dto.merchantId,
        queue: Promise.resolve(),
        queued: 0,
      }
      this.clients.set(socket.id, subscription)
      const snapshot = await this.chat.snapshot(tenantId, dto.merchantId)
      if (this.clients.get(socket.id) !== subscription) return { ok: false }
      await this.authorize(socket, tenantId)
      if (this.clients.get(socket.id) !== subscription) return { ok: false }
      return { ok: true, snapshot }
    } catch {
      if (socket.data.chatSubscriptionVersion === version)
        this.invalidate(socket, 'CHAT_SUBSCRIPTION_REJECTED')
      return { ok: false, reasonCode: 'CHAT_SUBSCRIPTION_REJECTED' }
    }
  }
  @Interval(15_000)
  async revalidate() {
    for (const subscription of this.clients.values()) {
      try {
        await this.authorize(subscription.socket, subscription.tenantId)
      } catch {
        if (this.clients.get(subscription.socket.id) === subscription)
          this.invalidate(subscription.socket, 'CHAT_ACCESS_REVOKED')
      }
    }
  }
  private publish(event: ChatEvent) {
    for (const subscription of this.clients.values()) {
      if (
        subscription.tenantId !== event.tenantId ||
        (subscription.merchantId && subscription.merchantId !== event.merchantId)
      )
        continue
      if (subscription.queued >= 32) {
        this.invalidate(subscription.socket, 'CHAT_RESYNC_REQUIRED')
        continue
      }
      subscription.queued++
      subscription.queue = subscription.queue
        .then(async () => {
          if (this.clients.get(subscription.socket.id) !== subscription) return
          try {
            await this.authorize(subscription.socket, subscription.tenantId)
            if (
              this.clients.get(subscription.socket.id) === subscription &&
              subscription.socket.connected
            ) {
              if (!subscription.socket.conn.transport.writable)
                this.invalidate(subscription.socket, 'CHAT_RESYNC_REQUIRED')
              else subscription.socket.emit('merchant-chat.event', event)
            }
          } catch {
            if (this.clients.get(subscription.socket.id) === subscription)
              this.invalidate(subscription.socket, 'CHAT_ACCESS_REVOKED')
          }
        })
        .finally(() => {
          subscription.queued--
        })
    }
  }
  private async authorize(socket: Socket, tenantId?: string) {
    const token = socket.handshake.auth.token
    if (typeof token !== 'string' || !(await this.jwt.checkToken(token)))
      throw new Error('invalid session')
    return this.access.authorize(await this.jwt.verifyAsync(token), tenantId)
  }
  private invalidate(socket: Socket, reasonCode: string) {
    this.clients.delete(socket.id)
    delete socket.data.chatSubscriptionVersion
    socket.emit('merchant-chat.invalidated', { reasonCode })
  }
}
