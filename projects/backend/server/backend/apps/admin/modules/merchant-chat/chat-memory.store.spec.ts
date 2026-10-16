import { ChatMemoryStore } from './chat-memory.store'
import { CHAT_TTL_MS, type ChatInbound } from './chat.types'

describe('Chat memory window', () => {
  const scope = { tenantId: 'tenant', merchantId: 'merchant' }
  const order = { id: 'order', platformOrderId: '9223372036854775807', counterpartyName: 'Buyer' }
  const input = (id: string): ChatInbound => ({
    orderNo: order.platformOrderId,
    sourceMessageId: id,
    buyerName: 'Buyer',
    type: 'TEXT',
    origin: 'BUYER',
    text: `message ${id}`,
  })
  let store: ChatMemoryStore
  beforeEach(() => {
    jest.useFakeTimers()
    store = new ChatMemoryStore()
  })
  afterEach(() => {
    store.clear()
    jest.useRealTimers()
  })
  it('opens an empty conversation once, publishes availability, and expires it after the window', () => {
    const events: string[] = []
    store.events.subscribe((event) => events.push(event.type))
    const first = store.open(scope, order, false)
    expect(store.open(scope, order, false).id).toBe(first.id)
    expect(store.snapshot(scope)).toEqual({ conversations: [first], messages: [] })
    expect(events).toEqual(['conversation'])
    store.availability(scope, new Set([order.id]), true)
    expect(store.conversation(scope, first.id).canReply).toBe(true)
    expect(events).toEqual(['conversation', 'conversation'])
    store.receive(scope, order, input('first'))
    expect(store.snapshot(scope).conversations[0].id).toBe(first.id)
    expect(store.snapshot(scope).messages).toHaveLength(1)
    const empty = store.open(scope, { ...order, id: 'empty' }, true)
    jest.advanceTimersByTime(CHAT_TTL_MS + 1)
    expect(store.snapshot(scope)).toEqual({ conversations: [], messages: [] })
    expect(() => store.conversation(scope, empty.id)).toThrow('会话已失效')
  })
  it('keeps empty windows within conversation capacity and message eviction ignores them', () => {
    const empty = store.open(scope, { ...order, id: 'empty' }, true)
    for (let c = 0; c < 51; c++)
      for (let m = 0; m < 200; m++)
        store.receive(scope, { ...order, id: `order-${c}` }, input(`${c}-${m}`))
    expect(store.snapshot(scope).messages).toHaveLength(10_000)
    expect(store.conversation(scope, empty.id).id).toBe(empty.id)
    for (let i = 0; i < 1000; i++) store.open(scope, { ...order, id: `empty-${i}` }, false)
    expect(store.snapshot(scope).conversations).toHaveLength(1000)
    expect(() => store.conversation(scope, empty.id)).toThrow('会话已失效')
  })
  it('deduplicates native IDs, keeps out-of-order IDs, and isolates tenant/merchant snapshots', () => {
    store.receive(scope, order, input('900'))
    store.receive(scope, order, input('800'))
    store.receive(scope, order, input('900'))
    expect(store.snapshot(scope).messages.map((m) => m.sourceMessageId)).toEqual(['900', '800'])
    expect(store.snapshot({ ...scope, tenantId: 'other' }).messages).toEqual([])
    expect(store.snapshot({ ...scope, merchantId: 'other' }).conversations).toEqual([])
  })
  it('deletes only a scoped window, revokes its attachments and allows a new message to reopen it', () => {
    store.receive(scope, order, {
      ...input('image'),
      type: 'IMAGE',
      imageUrl: 'https://private.example/image',
    })
    const { conversations, messages } = store.snapshot(scope)
    const id = conversations[0].id
    const image = messages[0]
    const other = store.open(scope, { ...order, id: 'other-order' }, false)
    const events: string[] = []
    store.events.subscribe((event) => events.push(event.type))
    expect(() => store.deleteConversation({ ...scope, tenantId: 'other' }, id)).toThrow(
      '会话已失效',
    )
    expect(() => store.deleteConversation({ ...scope, merchantId: 'other' }, id)).toThrow(
      '会话已失效',
    )
    expect(store.snapshot(scope).conversations).toHaveLength(2)
    store.deleteConversation(scope, id)
    expect(store.snapshot(scope)).toEqual({ conversations: [other], messages: [] })
    expect(() => store.attachment(scope, image.id, image.attachmentId!)).toThrow('图片已过期')
    expect(events).toEqual(['expired'])
    expect(() => store.deleteConversation(scope, id)).toThrow('会话已失效')
    store.receive(scope, order, input('new-message'))
    const reopened = store.snapshot(scope)
    expect(reopened.conversations.find((c) => c.merchantOrderId === order.id)?.id).not.toBe(id)
    expect(reopened.messages.map((message) => message.sourceMessageId)).toEqual(['new-message'])
  })
  it('keeps a sending window until its send result is known', () => {
    const conversation = store.open(scope, order, true)
    const message = store.outbound(scope, conversation.id, 'request', 'TEXT', 'hello')
    expect(() => store.deleteConversation(scope, conversation.id)).toThrow('正在发送')
    expect(store.snapshot(scope).messages[0].status).toBe('SENDING')
    store.update(message, 'UNKNOWN')
    store.deleteConversation(scope, conversation.id)
    expect(store.snapshot(scope)).toEqual({ conversations: [], messages: [] })
  })
  it('bounds each conversation and expires messages, conversation IDs, and private attachment URLs', () => {
    store.receive(scope, order, {
      ...input('image'),
      type: 'IMAGE',
      imageUrl: 'https://private-platform.example/image',
    })
    const snapshot = store.snapshot(scope)
    const image = snapshot.messages[0]
    expect(JSON.stringify(snapshot)).not.toContain('private-platform')
    expect(() =>
      store.attachment({ ...scope, tenantId: 'other' }, image.id, image.attachmentId!),
    ).toThrow('图片已过期')
    expect(store.attachment(scope, image.id, image.attachmentId!)).toContain('private-platform')
    for (let i = 0; i < 200; i++) store.receive(scope, order, input(String(i)))
    expect(store.snapshot(scope).messages).toHaveLength(200)
    expect(() => store.attachment(scope, image.id, image.attachmentId!)).toThrow('图片已过期')
    jest.advanceTimersByTime(CHAT_TTL_MS + 1)
    expect(store.snapshot(scope)).toEqual({ conversations: [], messages: [] })
    expect(() => store.conversation(scope, snapshot.conversations[0].id)).toThrow('会话已失效')
  })
  it('does not treat configuration invalidation as permission to reply to a stale window', () => {
    store.receive(scope, order, input('1'))
    store.receive(scope, order, input('2'))
    const events: string[] = []
    const subscription = store.events.subscribe((event) => events.push(event.type))
    store.disable(scope)
    expect(events).toEqual(['message'])
    expect(store.snapshot(scope).messages).toHaveLength(2)
    subscription.unsubscribe()
    expect(store.snapshot(scope).conversations[0].canReply).toBe(false)
    store.availability(scope, new Set([order.id]), true)
    expect(store.snapshot(scope).conversations[0].canReply).toBe(true)
    store.availability(scope, new Set(), true)
    expect(store.snapshot(scope).conversations[0].canReply).toBe(false)
  })
  it('caps the global window at 10000 messages across conversations', () => {
    for (let conversation = 0; conversation < 51; conversation++) {
      const currentOrder = { ...order, id: `order-${conversation}` }
      for (let index = 0; index < 200; index++)
        store.receive(scope, currentOrder, input(`${conversation}-${index}`))
    }
    const snapshot = store.snapshot(scope)
    expect(snapshot.messages).toHaveLength(10_000)
    expect(snapshot.conversations).toHaveLength(50)
    expect(snapshot.messages.some((message) => message.sourceMessageId === '0-0')).toBe(false)
  })
})
