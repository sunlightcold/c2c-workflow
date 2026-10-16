import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Subject } from 'rxjs'
import {
  CHAT_TTL_MS,
  ChatError,
  type ChatConversation,
  type ChatEvent,
  type ChatInbound,
  type ChatMessage,
  type ChatOrderContext,
  type ChatOrderSummary,
  type ChatScope,
} from './chat.types'

interface Window {
  conversation: ChatConversation
  messages: ChatMessage[]
  expiresAt: number
}
function orderSummary(order: ChatOrderContext): ChatOrderSummary {
  return {
    fiatAmount: order.fiatAmount,
    fiatCurrency: order.fiatCurrency,
    asset: order.asset,
    assetAmount: order.assetAmount,
    unitPrice: order.unitPrice,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    platformCreatedAt: order.platformCreatedAt.toISOString(),
    paymentDeadline: order.paymentDeadline?.toISOString() ?? null,
  }
}
@Injectable()
export class ChatMemoryStore {
  readonly instanceId = randomUUID()
  readonly events = new Subject<ChatEvent>()
  sequence = 0
  private readonly windows = new Map<string, Window>()
  private readonly attachments = new Map<string, string>()
  private messageCount = 0

  publish(event: Omit<ChatEvent, 'sequence' | 'instanceId'>) {
    this.events.next({ ...event, instanceId: this.instanceId, sequence: ++this.sequence })
  }
  snapshot(scope: { tenantId: string; merchantId?: string }) {
    this.sweep()
    const windows = [...this.windows.values()].filter(
      (w) =>
        w.conversation.tenantId === scope.tenantId &&
        (!scope.merchantId || w.conversation.merchantId === scope.merchantId),
    )
    return {
      conversations: windows.map((w) => ({ ...w.conversation })),
      messages: windows.flatMap((w) => w.messages.map((m) => ({ ...m }))),
    }
  }
  conversation(scope: ChatScope, id: string) {
    this.sweep()
    const window = this.windows.get(id)
    if (
      !window ||
      window.conversation.tenantId !== scope.tenantId ||
      window.conversation.merchantId !== scope.merchantId
    )
      throw new ChatError('CHAT_CONTEXT_UNAVAILABLE', '聊天会话已失效', 404)
    return window.conversation
  }
  deleteConversation(scope: ChatScope, id: string) {
    this.conversation(scope, id)
    if (this.windows.get(id)!.messages.some((message) => message.status === 'SENDING'))
      throw new ChatError('CHAT_CONVERSATION_BUSY', '会话正在发送消息，请稍后删除')
    this.remove(id)
  }
  orderIds(scope: ChatScope) {
    this.sweep()
    return [...this.windows.values()]
      .filter(
        (w) =>
          w.conversation.tenantId === scope.tenantId &&
          w.conversation.merchantId === scope.merchantId,
      )
      .map((w) => w.conversation.merchantOrderId)
  }
  syncOrders(scope: ChatScope, orders: ChatOrderContext[]) {
    const byId = new Map(orders.map((order) => [order.id, order]))
    for (const window of this.windows.values()) {
      if (
        window.conversation.tenantId !== scope.tenantId ||
        window.conversation.merchantId !== scope.merchantId
      )
        continue
      const order = byId.get(window.conversation.merchantOrderId)
      if (!order) continue
      const summary = orderSummary(order)
      if (JSON.stringify(window.conversation.order) === JSON.stringify(summary)) continue
      window.conversation.order = summary
      this.publish({ ...scope, type: 'conversation', conversation: { ...window.conversation } })
    }
  }
  open(scope: ChatScope, order: ChatOrderContext, canReply: boolean, buyerName = '买家') {
    this.sweep()
    let window = [...this.windows.values()].find(
      (w) =>
        w.conversation.tenantId === scope.tenantId &&
        w.conversation.merchantId === scope.merchantId &&
        w.conversation.merchantOrderId === order.id,
    )
    if (!window) {
      if (this.windows.size >= 1000) this.remove(this.windows.keys().next().value!)
      const conversation: ChatConversation = {
        ...scope,
        id: randomUUID(),
        merchantOrderId: order.id,
        platformOrderId: order.platformOrderId,
        buyerName: order.counterpartyName || buyerName,
        updatedAt: new Date().toISOString(),
        canReply,
        order: orderSummary(order),
      }
      window = { conversation, messages: [], expiresAt: Date.now() + CHAT_TTL_MS }
      this.windows.set(conversation.id, window)
      this.publish({ ...scope, type: 'conversation', conversation: { ...conversation } })
    }
    return { ...window.conversation }
  }
  receive(scope: ChatScope, order: ChatOrderContext, input: ChatInbound) {
    const conversation = this.open(scope, order, true, input.buyerName)
    const window = this.windows.get(conversation.id)!
    if (window.messages.some((m) => m.sourceMessageId === input.sourceMessageId)) return
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId: window.conversation.id,
      sourceMessageId: input.sourceMessageId,
      type: input.type,
      origin: input.origin,
      text: input.text,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      ...(input.imageUrl ? { attachmentId: randomUUID() } : {}),
    }
    if (input.imageUrl) this.attachments.set(message.id, input.imageUrl)
    this.append(window, message)
  }
  outbound(
    scope: ChatScope,
    conversationId: string,
    requestId: string,
    type: ChatMessage['type'],
    text?: string,
  ) {
    this.conversation(scope, conversationId)
    const message: ChatMessage = {
      id: randomUUID(),
      conversationId,
      requestId,
      type,
      origin: 'SELF',
      text,
      occurredAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      status: 'SENDING',
    }
    this.append(this.windows.get(conversationId)!, message)
    return message
  }
  update(
    message: ChatMessage,
    status: ChatMessage['status'],
    reasonCode?: string,
    imageUrl?: string,
  ) {
    const window = this.windows.get(message.conversationId)
    if (!window || !window.messages.includes(message)) return
    message.status = status
    message.reasonCode = reasonCode
    if (imageUrl) {
      message.attachmentId = randomUUID()
      this.attachments.set(message.id, imageUrl)
    }
    this.publish({
      ...window.conversation,
      type: 'message',
      conversation: { ...window.conversation },
      message: { ...message },
    })
  }
  attachment(scope: ChatScope, messageId: string, attachmentId: string) {
    this.sweep()
    const window = [...this.windows.values()].find(
      (w) =>
        w.conversation.tenantId === scope.tenantId &&
        w.conversation.merchantId === scope.merchantId &&
        w.messages.some((m) => m.id === messageId && m.attachmentId === attachmentId),
    )
    const url = window && this.attachments.get(messageId)
    if (!url) throw new ChatError('CHAT_ATTACHMENT_EXPIRED', '图片已过期或不可读取', 410)
    return url
  }
  disable(scope: ChatScope) {
    this.availability(scope, new Set(), false)
  }
  availability(scope: ChatScope, orderIds: Set<string>, connected: boolean) {
    for (const window of this.windows.values()) {
      if (
        window.conversation.tenantId !== scope.tenantId ||
        window.conversation.merchantId !== scope.merchantId
      )
        continue
      const enabled = connected && orderIds.has(window.conversation.merchantOrderId)
      if (window.conversation.canReply === enabled) continue
      window.conversation.canReply = enabled
      this.publish({ ...scope, type: 'conversation', conversation: { ...window.conversation } })
    }
  }
  sweep(now = Date.now()) {
    for (const [id, window] of this.windows) {
      while (
        window.messages.length &&
        Date.parse(window.messages[0].receivedAt) + CHAT_TTL_MS <= now
      )
        this.dropMessage(window)
      if (window.expiresAt <= now) this.remove(id)
    }
  }
  clear() {
    this.windows.clear()
    this.attachments.clear()
    this.messageCount = 0
    this.events.complete()
  }
  private append(window: Window, message: ChatMessage) {
    window.messages.push(message)
    this.messageCount++
    window.expiresAt = Date.now() + CHAT_TTL_MS
    window.conversation.updatedAt = message.receivedAt
    while (window.messages.length > 200) this.dropMessage(window)
    while (this.messageCount > 10_000) {
      const oldest = [...this.windows.values()]
        .filter((w) => w.messages.length)
        .sort(
          (a, b) => Date.parse(a.messages[0].receivedAt) - Date.parse(b.messages[0].receivedAt),
        )[0]
      this.dropMessage(oldest)
      if (!oldest.messages.length) this.remove(oldest.conversation.id)
    }
    this.publish({
      ...window.conversation,
      type: 'message',
      conversation: { ...window.conversation },
      message: { ...message },
    })
  }
  private dropMessage(window: Window) {
    const message = window.messages.shift()
    if (message) {
      this.attachments.delete(message.id)
      this.messageCount--
    }
  }
  private remove(id: string) {
    const window = this.windows.get(id)
    if (!window) return
    this.windows.delete(id)
    this.messageCount -= window.messages.length
    for (const message of window.messages) this.attachments.delete(message.id)
    this.publish({ ...window.conversation, type: 'expired', conversationId: id })
  }
}
