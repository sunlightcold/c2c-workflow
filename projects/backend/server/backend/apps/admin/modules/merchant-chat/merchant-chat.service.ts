import { Inject, Injectable, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Interval } from '@nestjs/schedule'
import { createHash, randomUUID } from 'node:crypto'
import { DataSource, In, Not } from 'typeorm'
import {
  BusinessStatus,
  IpProxyEntity,
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderSide,
  MerchantOrderStatus,
  MerchantPlatform,
  TenantEntity,
} from '@admin/database'
import { MerchantPlatformCredentialService } from '../business/merchant-platform-credential.service'
import { C2cPlatformCredentialFactory } from '../c2c-platform'
import type { BinanceCredentials } from '../c2c-platform/binance-c2c.client'
import { SECRET_RESOLVER, type SecretResolver } from '../system/credential/secret-resolver'
import { BinanceChatAdapter, type BinanceChatConnection } from './binance-chat.adapter'
import { ChatMemoryStore } from './chat-memory.store'
import type { ChatOrderQueryDto } from './merchant-chat.dto'
import { ChatImageService, requireChatImageUrl } from './chat-image.service'
import {
  CHAT_TTL_MS,
  ChatError,
  type ChatInbound,
  type ChatMerchant,
  type ChatMessage,
  type ChatScope,
  type ChatSnapshot,
  type ChatOrderOption,
} from './chat.types'

const terminal = [
  MerchantOrderStatus.COMPLETED,
  MerchantOrderStatus.CANCELLED,
  MerchantOrderStatus.EXPIRED,
]
const capabilities = (supported: boolean): ChatMerchant['capabilities'] => ({
  receiveText: supported ? 'SUPPORTED' : 'PENDING',
  receiveImage: supported ? 'SUPPORTED' : 'PENDING',
  sendText: supported ? 'SUPPORTED' : 'PENDING',
  sendImage: supported ? 'SUPPORTED' : 'PENDING',
})
interface Session {
  scope: ChatScope
  fingerprint: string
  connection?: BinanceChatConnection
  orders: Map<string, MerchantOrderEntity>
  seen: Map<string, number>
  initializedOrders: Set<string>
  retryAt: number
  attempts: number
  stopped: boolean
  connecting: boolean
  fetching: boolean
  unread: boolean
  busy: boolean
  notificationTimer?: NodeJS.Timeout
  retryTimer?: NodeJS.Timeout
  credentials: BinanceCredentials
}
export interface ReplyResult {
  instanceId: string
  requestId: string
  messages: Array<Pick<ChatMessage, 'id' | 'type' | 'status' | 'reasonCode'>>
}
interface SessionLoadToken {
  scope: ChatScope
  valid: boolean
}
interface RequestState {
  digest: string
  expiresAt: number
  result: Promise<ReplyResult>
}

@Injectable()
export class MerchantChatService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly startedAt = Date.now()
  private readonly sessions = new Map<string, Session>()
  private readonly merchants = new Map<string, ChatMerchant>()
  private readonly requests = new Map<string, RequestState>()
  private refreshing = false
  private destroyed = false
  private readonly ensuring = new Map<
    string,
    { token: SessionLoadToken; result: Promise<Session> }
  >()
  constructor(
    private readonly database: DataSource,
    private readonly credentialService: MerchantPlatformCredentialService,
    @Inject(SECRET_RESOLVER) private readonly secrets: SecretResolver,
    private readonly credentialFactory: C2cPlatformCredentialFactory,
    private readonly adapter: BinanceChatAdapter,
    readonly memory: ChatMemoryStore,
    private readonly images: ChatImageService,
  ) {}

  onApplicationBootstrap() {
    this.refresh()
  }
  onModuleDestroy() {
    this.destroyed = true
    for (const session of this.sessions.values()) this.stop(session)
    this.sessions.clear()
    this.requests.clear()
    this.memory.clear()
  }
  @Interval(30_000)
  async refresh() {
    if (this.destroyed || this.refreshing) return
    this.refreshing = true
    try {
      this.memory.sweep()
      for (const [key, request] of this.requests)
        if (request.expiresAt <= Date.now()) this.requests.delete(key)
      // System enumeration only reads tenant identities; business queries remain tenant scoped.
      const tenants = await this.database
        .getRepository(TenantEntity)
        .find({ where: { status: BusinessStatus.ACTIVE }, select: { id: true } })
      const live = new Set<string>()
      for (const tenant of tenants) {
        const merchants = await this.database
          .getRepository(MerchantEntity)
          .find({ where: { tenantId: tenant.id }, order: { createdAt: 'ASC' }, take: 1000 })
        for (const merchant of merchants) {
          const scope = { tenantId: tenant.id, merchantId: merchant.id }
          const key = this.key(scope)
          live.add(key)
          if (
            merchant.platform !== MerchantPlatform.BINANCE ||
            merchant.status !== BusinessStatus.ACTIVE
          ) {
            const session = this.sessions.get(key)
            if (session) {
              this.stop(session)
              this.sessions.delete(key)
            }
            this.setMerchant(
              merchant,
              merchant.platform === MerchantPlatform.OKX ? 'PENDING' : 'DISABLED',
            )
            this.memory.disable(scope)
            continue
          }
          try {
            await this.ensure(scope)
          } catch {
            this.setMerchant(merchant, 'ERROR', 'CHAT_CONTEXT_UNAVAILABLE')
          }
        }
      }
      for (const [key, session] of this.sessions)
        if (!live.has(key)) {
          this.stop(session)
          this.sessions.delete(key)
          this.memory.disable(session.scope)
        }
      for (const key of this.merchants.keys()) if (!live.has(key)) this.merchants.delete(key)
    } catch {
      // No exception objects: adapters can contain credentials, URLs or message bodies.
      for (const session of this.sessions.values()) {
        this.stop(session)
        this.memory.disable(session.scope)
      }
      this.sessions.clear()
    } finally {
      this.refreshing = false
    }
  }
  async snapshot(tenantId: string, merchantId?: string): Promise<ChatSnapshot> {
    const tenant = await this.database
      .getRepository(TenantEntity)
      .findOneBy({ id: tenantId, status: BusinessStatus.ACTIVE })
    if (!tenant) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '经营单位不可用', 404)
    const catalog = await this.database
      .getRepository(MerchantEntity)
      .find({ where: { tenantId }, take: 1000, order: { createdAt: 'ASC' } })
    for (const merchant of catalog)
      if (!this.merchants.has(this.key({ tenantId, merchantId: merchant.id })))
        this.setMerchant(
          merchant,
          merchant.platform === MerchantPlatform.OKX
            ? 'PENDING'
            : merchant.status === BusinessStatus.ACTIVE
              ? 'CONNECTING'
              : 'DISABLED',
        )
    if (merchantId) {
      const merchant = await this.database
        .getRepository(MerchantEntity)
        .findOneBy({ id: merchantId, tenantId })
      if (!merchant) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家不可用', 404)
      if (
        merchant.status === BusinessStatus.ACTIVE &&
        merchant.platform === MerchantPlatform.BINANCE
      ) {
        try {
          await this.ensure({ tenantId, merchantId })
        } catch {
          this.setMerchant(merchant, 'ERROR', 'CHAT_CONTEXT_UNAVAILABLE')
        }
      } else
        this.setMerchant(
          merchant,
          merchant.platform === MerchantPlatform.OKX ? 'PENDING' : 'DISABLED',
        )
    }
    const window = this.memory.snapshot({ tenantId, merchantId })
    return {
      instanceId: this.memory.instanceId,
      sequence: this.memory.sequence,
      retentionSeconds: CHAT_TTL_MS / 1000,
      merchants: [...this.merchants.values()].filter(
        (m) => m.tenantId === tenantId && (!merchantId || m.merchantId === merchantId),
      ),
      ...window,
    }
  }
  async listOrders(tenantId: string, input: ChatOrderQueryDto) {
    const query = this.database
      .getRepository(MerchantOrderEntity)
      .createQueryBuilder('orders')
      .innerJoin(
        MerchantEntity,
        'merchant',
        'merchant.id = orders.merchantId AND merchant.tenantId = :tenantId AND merchant.status = :active AND merchant.platform = :platform',
        {
          tenantId,
          active: BusinessStatus.ACTIVE,
          platform: MerchantPlatform.BINANCE,
        },
      )
      .where('orders.tenantId = :tenantId', { tenantId })
      .andWhere('orders.platform = :platform', { platform: MerchantPlatform.BINANCE })
      .andWhere('orders.side = :side', { side: MerchantOrderSide.BUY })
      .andWhere('orders.status NOT IN (:...terminal)', { terminal })
    if (input.merchantId)
      query.andWhere('orders.merchantId = :merchantId', { merchantId: input.merchantId })
    if (input.platformOrderId?.trim())
      query.andWhere('POSITION(:orderNo IN orders.platformOrderId) > 0', {
        orderNo: input.platformOrderId.trim(),
      })
    if (input.counterpartyName?.trim())
      query.andWhere('POSITION(:buyer IN orders.counterpartyName) > 0', {
        buyer: input.counterpartyName.trim(),
      })
    if (input.status) query.andWhere('orders.status = :status', { status: input.status })
    const total = await query.getCount()
    const items = await query
      .select([
        'orders.id AS "id"',
        'orders.merchantId AS "merchantId"',
        'merchant.name AS "merchantName"',
        'orders.platformOrderId AS "platformOrderId"',
        'orders.counterpartyName AS "counterpartyName"',
        'orders.status AS "status"',
        'orders.fiatAmount AS "fiatAmount"',
        'orders.fiatCurrency AS "fiatCurrency"',
        'orders.platformCreatedAt AS "platformCreatedAt"',
      ])
      .orderBy('orders.platformCreatedAt', 'DESC')
      .addOrderBy('orders.id', 'DESC')
      .offset((input.page - 1) * input.pageSize)
      .limit(input.pageSize)
      .getRawMany<ChatOrderOption>()
    return { items, total, page: input.page, pageSize: input.pageSize }
  }
  async openConversation(scope: ChatScope, merchantOrderId: string) {
    await this.order(scope, merchantOrderId)
    const session = await this.ensure(scope)
    const order = await this.order(scope, merchantOrderId)
    if (session.stopped) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
    const connected = !!session.connection?.ready()
    this.memory.availability(
      scope,
      new Set([...session.orders.values()].map((o) => o.id)),
      connected,
    )
    const conversation = this.memory.open(
      scope,
      order,
      connected && session.orders.has(order.platformOrderId),
    )
    return { instanceId: this.memory.instanceId, conversation }
  }
  deleteConversation(scope: ChatScope, instanceId: string, conversationId: string) {
    this.requireInstance(instanceId)
    this.memory.deleteConversation(scope, conversationId)
    return { conversationId }
  }
  requireInstance(instanceId: string) {
    if (instanceId !== this.memory.instanceId)
      throw new ChatError('CHAT_INSTANCE_CHANGED', '聊天运行窗口已变化，请刷新后重试')
  }
  async reply(
    scope: ChatScope,
    input: { conversationId: string; instanceId: string; requestId: string; text?: string },
    actorUserId: number,
    file?: Express.Multer.File,
  ): Promise<ReplyResult> {
    this.requireInstance(input.instanceId)
    const conversation = this.memory.conversation(scope, input.conversationId)
    const text = input.text?.trim()
    if (!text && !file) throw new ChatError('CHAT_EMPTY_MESSAGE', '请输入文字或选择图片', 400)
    if (text && text.length > 4000)
      throw new ChatError('CHAT_TEXT_TOO_LONG', '文字不能超过4000字', 400)
    const digest = createHash('sha256')
      .update(
        JSON.stringify({
          ...scope,
          conversationId: conversation.id,
          text: text ?? '',
          actorUserId,
          mime: file?.mimetype,
        }),
      )
      .update(file?.buffer ?? Buffer.alloc(0))
      .digest('hex')
    const key = `${scope.tenantId}:${scope.merchantId}:${input.requestId}`
    const previous = this.previousRequest(key, digest)
    if (previous) return previous
    const order = await this.order(scope, conversation.merchantOrderId)
    const session = await this.ensure(scope)
    const concurrent = this.previousRequest(key, digest)
    if (concurrent) return concurrent
    if (!conversation.canReply || !session.connection?.ready())
      throw new ChatError('CHAT_SOCKET_UNAVAILABLE', '聊天当前不可发送')
    if (session.busy) throw new ChatError('CHAT_SEND_BUSY', '当前商家正在发送，请稍后重试', 429)
    if (this.requests.size >= 1024)
      throw new ChatError('CHAT_SEND_BUSY', '当前发送窗口已满，请稍后重试', 429)
    session.busy = true
    const result = this.send(session, order, conversation.id, input.requestId, text, file).finally(
      () => {
        session.busy = false
      },
    )
    this.requests.set(key, { digest, expiresAt: Date.now() + CHAT_TTL_MS, result })
    return result
  }
  async attachment(scope: ChatScope, instanceId: string, messageId: string, attachmentId: string) {
    this.requireInstance(instanceId)
    await this.context(scope)
    const url = this.memory.attachment(scope, messageId, attachmentId)
    const raw = await this.images.transfer(scope, url)
    // Recheck after I/O so expiry or tenant changes do not leave a readable stale image.
    this.memory.attachment(scope, messageId, attachmentId)
    await this.context(scope)
    const content = Buffer.from(raw)
    const image = await this.images.inspect(content)
    return { content, mime: image.mime }
  }
  @OnEvent('merchant-chat.configuration-changed')
  invalidate(scope: { tenantId: string; merchantId?: string }) {
    for (const { token } of this.ensuring.values())
      if (
        token.scope.tenantId === scope.tenantId &&
        (!scope.merchantId || token.scope.merchantId === scope.merchantId)
      )
        token.valid = false
    for (const [key, session] of this.sessions)
      if (
        session.scope.tenantId === scope.tenantId &&
        (!scope.merchantId || session.scope.merchantId === scope.merchantId)
      ) {
        this.stop(session)
        this.sessions.delete(key)
        this.memory.disable(session.scope)
        const view = this.merchants.get(key)
        if (view) {
          view.status = 'RECONNECTING'
          this.memory.publish({ ...view, type: 'merchant', merchant: { ...view } })
        }
      }
  }
  private async context(scope: ChatScope) {
    const tenant = await this.database
      .getRepository(TenantEntity)
      .findOneBy({ id: scope.tenantId, status: BusinessStatus.ACTIVE })
    const merchant =
      tenant &&
      (await this.database.getRepository(MerchantEntity).findOneBy({
        id: scope.merchantId,
        tenantId: scope.tenantId,
        status: BusinessStatus.ACTIVE,
      }))
    if (!merchant) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家不可用', 404)
    if (merchant.platform !== MerchantPlatform.BINANCE)
      throw new ChatError('CHAT_UNSUPPORTED', '该平台聊天待接入')
    const reference = await this.credentialService.getActiveReference(
      scope.tenantId,
      scope.merchantId,
    )
    const proxy = merchant.proxyId
      ? await this.database
          .getRepository(IpProxyEntity)
          .createQueryBuilder('proxy')
          .addSelect('proxy.passwordRef')
          .where('proxy.tenantId = :tenantId AND proxy.id = :id', {
            tenantId: scope.tenantId,
            id: merchant.proxyId,
          })
          .getOne()
      : null
    if (
      merchant.proxyId &&
      (!proxy ||
        proxy.status !== 'active' ||
        (proxy.expiresAt && proxy.expiresAt.getTime() <= Date.now()))
    )
      throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家代理不可用')
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          reference,
          proxy: proxy && [
            proxy.id,
            proxy.protocol,
            proxy.host,
            proxy.port,
            proxy.username,
            proxy.passwordRef,
            proxy.status,
            proxy.expiresAt,
          ],
        }),
      )
      .digest('hex')
    return { merchant, reference, fingerprint }
  }
  private ensure(scope: ChatScope): Promise<Session> {
    const key = this.key(scope)
    const pending = this.ensuring.get(key)
    if (pending) return pending.result
    if (this.ensuring.size >= 64)
      return Promise.reject(new ChatError('CHAT_CONNECTION_LIMIT', '实时聊天连接容量已满', 429))
    const token: SessionLoadToken = { scope, valid: true }
    const result = this.loadSession(token)
      .catch((error) => {
        const session = this.sessions.get(key)
        if (session) {
          this.stop(session)
          this.sessions.delete(key)
          this.memory.disable(scope)
        }
        throw error
      })
      .finally(() => {
        this.ensuring.delete(key)
      })
    this.ensuring.set(key, { token, result })
    return result
  }
  private async loadSession(token: SessionLoadToken): Promise<Session> {
    const { scope } = token
    const key = this.key(scope)
    const context = await this.context(scope)
    this.requireSessionLoad(token)
    let session = this.sessions.get(key)
    if (session && session.fingerprint !== context.fingerprint) {
      this.stop(session)
      this.sessions.delete(key)
      session = undefined
    }
    if (!session) session = await this.createSession(scope, context, token)
    const orders = await this.database.getRepository(MerchantOrderEntity).find({
      where: {
        ...scope,
        platform: MerchantPlatform.BINANCE,
        side: MerchantOrderSide.BUY,
        status: Not(In(terminal)),
      },
      order: { platformCreatedAt: 'DESC' },
      take: 101,
    })
    this.requireSessionLoad(token)
    if (session.stopped) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
    if (orders.length > 100) {
      this.stop(session)
      this.sessions.delete(key)
      throw new ChatError('CHAT_ORDER_LIMIT', '当前活动订单超出聊天窗口容量')
    }
    session.orders = new Map(orders.map((order) => [order.platformOrderId, order]))
    for (const id of session.initializedOrders)
      if (!session.orders.has(id)) session.initializedOrders.delete(id)
    if (session.connection?.ready() && !session.connecting) await this.initializeOrders(session)
    if (session.stopped) throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
    this.memory.availability(
      scope,
      new Set(orders.map((order) => order.id)),
      session.connection?.ready() ?? false,
    )
    if (!session.connection && !session.connecting && session.retryAt <= Date.now())
      this.connect(session, context.merchant)
    return session
  }
  private requireSessionLoad(token: SessionLoadToken) {
    if (this.destroyed || !token.valid)
      throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '商家配置已变化')
  }
  private async createSession(
    scope: ChatScope,
    context: Awaited<ReturnType<MerchantChatService['context']>>,
    token: SessionLoadToken,
  ): Promise<Session> {
    if (this.sessions.size >= 64)
      throw new ChatError('CHAT_CONNECTION_LIMIT', '实时聊天连接容量已满', 429)
    const secret = await this.secrets.resolve(context.reference.credentialRef)
    this.requireSessionLoad(token)
    const credentials = this.credentialFactory.create(
      MerchantPlatform.BINANCE,
      context.reference,
      secret,
    ) as BinanceCredentials
    if (this.sessions.size >= 64)
      throw new ChatError('CHAT_CONNECTION_LIMIT', '实时聊天连接容量已满', 429)
    const session: Session = {
      scope,
      fingerprint: context.fingerprint,
      credentials,
      orders: new Map(),
      seen: new Map(),
      initializedOrders: new Set(),
      retryAt: 0,
      attempts: 0,
      stopped: false,
      connecting: false,
      fetching: false,
      unread: false,
      busy: false,
    }
    this.sessions.set(this.key(scope), session)
    return session
  }
  private async connect(session: Session, merchant: MerchantEntity) {
    if (this.destroyed || session.stopped) return
    clearTimeout(session.retryTimer)
    session.connecting = true
    this.setMerchant(merchant, session.attempts ? 'RECONNECTING' : 'CONNECTING')
    try {
      // Startup history establishes a baseline; only messages from this runtime are displayed.
      session.initializedOrders.clear()
      await this.initializeOrders(session)
      if (session.stopped) return
      const connection = await this.adapter.connect(session.credentials, {
        active: () => !session.stopped,
        opened: () => {
          if (!session.stopped) {
            session.attempts = 0
            this.setMerchant(merchant, 'CONNECTED')
            this.memory.availability(
              session.scope,
              new Set([...session.orders.values()].map((order) => order.id)),
              true,
            )
          }
        },
        message: (input) => this.inbound(session, input, false),
        unread: () => this.notifyUnread(session),
        invalid: () => {
          if (!session.stopped) this.setMerchant(merchant, 'ERROR', 'CHAT_PROTOCOL_INVALID')
        },
        closed: () => {
          session.connection = undefined
          if (!session.stopped) {
            this.memory.availability(
              session.scope,
              new Set([...session.orders.values()].map((order) => order.id)),
              false,
            )
            this.scheduleReconnect(session, merchant, 'RECONNECTING', 'CHAT_SOCKET_UNAVAILABLE')
          }
        },
      })
      if (session.stopped) connection.close()
      else session.connection = connection
    } catch {
      if (!session.stopped) {
        this.scheduleReconnect(session, merchant, 'ERROR', 'CHAT_CONTEXT_UNAVAILABLE')
      }
    } finally {
      session.connecting = false
    }
  }
  private scheduleReconnect(
    session: Session,
    merchant: MerchantEntity,
    status: ChatMerchant['status'],
    reasonCode: string,
  ) {
    clearTimeout(session.retryTimer)
    const delay = Math.min(60_000, 5000 * 2 ** Math.min(session.attempts++, 4))
    session.retryAt = Date.now() + delay
    this.setMerchant(merchant, status, reasonCode)
    session.retryTimer = setTimeout(() => {
      if (!session.stopped) this.ensure(session.scope).catch(() => undefined)
    }, delay)
    session.retryTimer.unref()
  }
  private async initializeOrders(session: Session) {
    for (const order of session.orders.values()) {
      if (session.stopped) return
      if (session.initializedOrders.has(order.platformOrderId)) continue
      const messages = await this.adapter.messages(
        session.credentials,
        order.platformOrderId,
        () => !session.stopped,
      )
      if (session.stopped) return
      for (const input of messages) this.inbound(session, input, true)
      session.initializedOrders.add(order.platformOrderId)
    }
  }
  private inbound(session: Session, input: ChatInbound, fromHttp: boolean) {
    if (session.stopped) return
    const order = session.orders.get(input.orderNo)
    if (!order || input.origin === 'SELF') return
    const now = Date.now()
    for (const [key, expiry] of session.seen) if (expiry <= now) session.seen.delete(key)
    const key = `${input.orderNo}:${input.sourceMessageId}`
    if (!input.sourceMessageId || session.seen.has(key)) return
    session.seen.set(key, now + CHAT_TTL_MS)
    while (session.seen.size > 20_000) session.seen.delete(session.seen.keys().next().value!)
    if (
      (fromHttp && !input.occurredAt) ||
      (input.occurredAt &&
        Date.parse(input.occurredAt) < Math.max(this.startedAt, now - CHAT_TTL_MS))
    )
      return
    this.memory.receive(session.scope, order, input)
  }
  private notifyUnread(session: Session) {
    if (session.stopped) return
    session.unread = true
    if (session.fetching || session.notificationTimer) return
    session.notificationTimer = setTimeout(() => {
      session.notificationTimer = undefined
      this.fetchUnread(session)
    }, 250)
    session.notificationTimer.unref()
  }
  private async fetchUnread(session: Session) {
    if (session.stopped) return
    session.fetching = true
    session.unread = false
    try {
      const current = await this.ensure(session.scope)
      if (current !== session || session.stopped) return
      for (const order of session.orders.values()) {
        for (const input of await this.adapter.messages(
          session.credentials,
          order.platformOrderId,
          () => !session.stopped,
        ))
          this.inbound(session, input, true)
        if (session.stopped) break
      }
    } catch {
      const merchant = this.merchants.get(this.key(session.scope))
      if (merchant) {
        merchant.reasonCode = 'CHAT_RECEIVE_FAILED'
        this.memory.publish({ ...session.scope, type: 'merchant', merchant: { ...merchant } })
      }
    } finally {
      session.fetching = false
      if (session.unread && !session.stopped) this.notifyUnread(session)
    }
  }
  private async send(
    session: Session,
    order: MerchantOrderEntity,
    conversationId: string,
    requestId: string,
    text?: string,
    file?: Express.Multer.File,
  ): Promise<ReplyResult> {
    const messages: ChatMessage[] = []
    for (const type of ['TEXT', 'IMAGE'] as const) {
      if ((type === 'TEXT' && !text) || (type === 'IMAGE' && !file)) continue
      const message = this.memory.outbound(
        session.scope,
        conversationId,
        requestId,
        type,
        type === 'TEXT' ? text : undefined,
      )
      messages.push(message)
      try {
        let payload: Record<string, unknown> = { type: 'text', content: text }
        let imageUrl: string | undefined
        if (type === 'IMAGE' && file) {
          const image = await this.images.inspect(file.buffer, file.mimetype)
          await this.requireSendContext(session, order.id)
          const upload = await this.adapter.imageUpload(
            session.credentials,
            `${randomUUID()}.${image.type === 'jpeg' ? 'jpg' : image.type}`,
          )
          requireChatImageUrl(upload.imageUrl)
          await this.requireSendContext(session, order.id)
          await this.images.transfer(session.scope, upload.preSignedUrl, file.buffer)
          imageUrl = upload.imageUrl
          payload = {
            type: 'image',
            imageUrl,
            thumbnailUrl: imageUrl,
            imageType: image.type,
            width: image.width,
            height: image.height,
          }
        }
        const connection = await this.requireSendContext(session, order.id)
        const status = await connection.send(order.platformOrderId, payload)
        this.memory.update(
          message,
          status,
          status === 'UNKNOWN' ? 'CHAT_SEND_UNKNOWN' : undefined,
          imageUrl,
        )
      } catch (error) {
        this.memory.update(
          message,
          'FAILED',
          error instanceof ChatError ? error.reasonCode : 'CHAT_SEND_FAILED',
        )
      }
    }
    return {
      instanceId: this.memory.instanceId,
      requestId,
      messages: messages.map(({ id, type, status, reasonCode }) => ({
        id,
        type,
        status,
        reasonCode,
      })),
    }
  }
  private async requireSendContext(session: Session, orderId: string) {
    await this.order(session.scope, orderId)
    const context = await this.context(session.scope)
    if (
      session.stopped ||
      context.fingerprint !== session.fingerprint ||
      !session.connection?.ready()
    )
      throw new ChatError('CHAT_SOCKET_UNAVAILABLE', '商家配置已变化，请刷新后重试')
    return session.connection
  }
  private async order(scope: ChatScope, id: string) {
    const order = await this.database.getRepository(MerchantOrderEntity).findOneBy({
      ...scope,
      id,
      platform: MerchantPlatform.BINANCE,
      side: MerchantOrderSide.BUY,
      status: Not(In(terminal)),
    })
    if (!order) throw new ChatError('CHAT_ORDER_NOT_FOUND', '订单当前不可聊天', 404)
    return order
  }
  private setMerchant(
    merchant: Pick<MerchantEntity, 'tenantId' | 'id' | 'name' | 'platform'>,
    status: ChatMerchant['status'],
    reasonCode?: string,
  ) {
    const view: ChatMerchant = {
      tenantId: merchant.tenantId,
      merchantId: merchant.id,
      name: merchant.name,
      platform: merchant.platform,
      status,
      reasonCode,
      capabilities: capabilities(merchant.platform === MerchantPlatform.BINANCE),
    }
    const previous = this.merchants.get(this.key(view))
    if (
      previous &&
      previous.name === view.name &&
      previous.platform === view.platform &&
      previous.status === status &&
      previous.reasonCode === reasonCode
    )
      return
    if (!previous && this.merchants.size >= 10_000) {
      const idle = [...this.merchants.keys()].find((key) => !this.sessions.has(key))
      if (idle) this.merchants.delete(idle)
    }
    this.merchants.set(this.key(view), view)
    this.memory.publish({ ...view, type: 'merchant', merchant: { ...view } })
  }
  private key(scope: ChatScope) {
    return `${scope.tenantId}:${scope.merchantId}`
  }
  private previousRequest(key: string, digest: string) {
    const previous = this.requests.get(key)
    if (!previous || previous.expiresAt <= Date.now()) return
    if (previous.digest !== digest)
      throw new ChatError('CHAT_DUPLICATE_MESSAGE', '该请求标识已用于其他内容')
    return previous.result
  }
  private stop(session: Session) {
    session.stopped = true
    clearTimeout(session.notificationTimer)
    clearTimeout(session.retryTimer)
    session.connection?.close()
    session.connection = undefined
  }
}
