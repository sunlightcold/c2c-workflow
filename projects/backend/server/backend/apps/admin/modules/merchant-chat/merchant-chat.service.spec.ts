import { MerchantChatService } from './merchant-chat.service'
import { ChatMemoryStore } from './chat-memory.store'
import { C2cPlatformCredentialFactory } from '../c2c-platform/c2c-platform-credential.factory'
import {
  MerchantEntity,
  MerchantOrderEntity,
  TenantEntity,
  MerchantPlatform,
  BusinessStatus,
} from '@admin/database'
import { CHAT_TTL_MS, type ChatInbound } from './chat.types'

describe('Merchant live chat', () => {
  const scope = { tenantId: 'tenant', merchantId: 'merchant' }
  const order = {
    ...scope,
    id: 'local-order',
    platformOrderId: '20476365073825144832',
    counterpartyName: 'Buyer',
  }
  let callbacks: {
    opened: () => void
    message: (input: ChatInbound) => void
    unread: () => void
    closed: () => void
  }
  const connection = { ready: jest.fn(), send: jest.fn(), close: jest.fn() }
  const adapter = { messages: jest.fn(), connect: jest.fn(), imageUpload: jest.fn() }
  const orders = { find: jest.fn(), findOneBy: jest.fn() }
  const merchant = {
    ...scope,
    id: scope.merchantId,
    name: 'Merchant',
    status: BusinessStatus.ACTIVE,
    platform: MerchantPlatform.BINANCE,
    proxyId: null,
  }
  const merchants = { find: jest.fn(), findOneBy: jest.fn() }
  const tenants = { find: jest.fn(), findOneBy: jest.fn() }
  const credential = { getActiveReference: jest.fn() }
  const images = { inspect: jest.fn(), transfer: jest.fn() }
  const secrets = { resolve: jest.fn() }
  let service: MerchantChatService
  let memory: ChatMemoryStore
  const input = (id: string, occurredAt = new Date().toISOString()): ChatInbound => ({
    sourceMessageId: id,
    orderNo: order.platformOrderId,
    type: 'TEXT',
    origin: 'BUYER',
    text: id,
    buyerName: 'Buyer',
    occurredAt,
  })
  const settle = () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  async function connected() {
    await service.snapshot(scope.tenantId, scope.merchantId)
    await settle()
    callbacks.opened()
    await service.snapshot(scope.tenantId, scope.merchantId)
  }
  beforeEach(() => {
    jest.clearAllMocks()
    orders.find.mockResolvedValue([order])
    orders.findOneBy.mockResolvedValue(order)
    merchants.find.mockResolvedValue([merchant])
    merchants.findOneBy.mockResolvedValue(merchant)
    tenants.find.mockResolvedValue([{ id: scope.tenantId }])
    tenants.findOneBy.mockResolvedValue({ id: scope.tenantId })
    credential.getActiveReference.mockResolvedValue({
      ...scope,
      credentialRef: 'enc://version-1',
      apiBaseUrl: 'https://api.binance.com',
      clientType: 'web',
      xUserId: null,
      requestTimeoutMs: 15000,
    })
    adapter.messages.mockResolvedValue([])
    adapter.connect.mockImplementation(async (_credentials, handlers) => {
      callbacks = handlers
      return connection
    })
    connection.ready.mockReturnValue(true)
    connection.send.mockResolvedValue('UNKNOWN')
    secrets.resolve.mockResolvedValue({ apiKey: 'test-key', secretKey: 'test-secret' })
    memory = new ChatMemoryStore()
    const database = {
      getRepository: (entity) =>
        entity === MerchantEntity
          ? merchants
          : entity === MerchantOrderEntity
            ? orders
            : entity === TenantEntity
              ? tenants
              : {},
    }
    service = new MerchantChatService(
      database as never,
      credential as never,
      secrets,
      new C2cPlatformCredentialFactory(),
      adapter as never,
      memory,
      images as never,
    )
  })
  afterEach(() => service.onModuleDestroy())
  it('filters startup history and processes current WSS and notification HTTP messages without numeric ordering loss', async () => {
    adapter.messages.mockResolvedValueOnce([input('old', '2000-01-01T00:00:00Z')])
    await connected()
    expect(memory.snapshot(scope).messages).toEqual([])
    callbacks.message(input('900'))
    callbacks.message(input('800'))
    callbacks.message(input('900'))
    expect(memory.snapshot(scope).messages.map((m) => m.text)).toEqual(['900', '800'])
    adapter.messages.mockResolvedValue([input('900'), input('700')])
    callbacks.unread()
    callbacks.unread()
    await new Promise((resolve) => {
      setTimeout(resolve, 300)
    })
    expect(memory.snapshot(scope).messages.map((m) => m.text)).toEqual(['900', '800', '700'])
    expect(adapter.messages).toHaveBeenCalledTimes(2)
    expect(adapter.messages.mock.calls[0][0].proxyScope).toEqual(scope)
    expect(
      orders.find.mock.calls.every(
        ([query]) =>
          query.where.tenantId === scope.tenantId && query.where.merchantId === scope.merchantId,
      ),
    ).toBe(true)
  })
  it('keeps concurrent duplicate requests idempotent, refuses changed content, and never retries UNKNOWN', async () => {
    await connected()
    callbacks.message(input('one'))
    const conversation = memory.snapshot(scope).conversations[0]
    const request = {
      conversationId: conversation.id,
      instanceId: memory.instanceId,
      requestId: 'request',
      text: 'reply',
    }
    const [first, duplicate] = await Promise.all([
      service.reply(scope, request, 2),
      service.reply(scope, request, 2),
    ])
    expect(first).toEqual(duplicate)
    expect(first.messages[0]).toMatchObject({ status: 'UNKNOWN', reasonCode: 'CHAT_SEND_UNKNOWN' })
    await expect(service.reply(scope, { ...request, text: 'different' }, 2)).rejects.toThrow(
      '标识已用于其他内容',
    )
    await service.reply(scope, request, 2)
    expect(connection.send).toHaveBeenCalledTimes(1)
  })
  it('closes the previous connection on configuration invalidation and blocks old window sends', async () => {
    await connected()
    callbacks.message(input('one'))
    const conversation = memory.snapshot(scope).conversations[0]
    service.invalidate(scope)
    expect(connection.close).toHaveBeenCalledTimes(1)
    callbacks.message(input('stale'))
    expect(memory.snapshot(scope).messages).toHaveLength(1)
    await expect(
      service.reply(
        scope,
        {
          conversationId: conversation.id,
          instanceId: memory.instanceId,
          requestId: 'new',
          text: 'reply',
        },
        2,
      ),
    ).rejects.toThrow('不可发送')
    expect(connection.send).not.toHaveBeenCalled()
  })
  it('reports partial text/image results and rejects cross-instance and terminal-order sends', async () => {
    await connected()
    callbacks.message(input('one'))
    const conversation = memory.snapshot(scope).conversations[0]
    const request = {
      conversationId: conversation.id,
      instanceId: memory.instanceId,
      requestId: 'partial',
      text: 'reply',
    }
    connection.send.mockResolvedValue('SENT')
    images.inspect.mockRejectedValue(new Error('bad image'))
    const file = {
      buffer: Buffer.from('invalid'),
      mimetype: 'image/png',
    }
    const result = await service.reply(scope, request, 2, file as Express.Multer.File)
    expect(result.messages.map((m) => m.status)).toEqual(['SENT', 'FAILED'])
    await expect(service.reply(scope, { ...request, instanceId: 'other' }, 2)).rejects.toThrow(
      '运行窗口已变化',
    )
    orders.findOneBy.mockResolvedValue(null)
    await expect(service.reply(scope, { ...request, requestId: 'terminal' }, 2)).rejects.toThrow(
      '订单当前不可聊天',
    )
  })
  it('does not reconnect a stopped session after an in-flight order query returns', async () => {
    await connected()
    callbacks.closed()
    let finish!: (orders: unknown[]) => void
    orders.find.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = service.snapshot(scope.tenantId, scope.merchantId)
    await settle()
    service.invalidate(scope)
    finish([order])
    await pending
    await settle()
    expect(adapter.connect).toHaveBeenCalledTimes(1)
    expect(adapter.messages).toHaveBeenCalledTimes(1)
  })
  it('keeps unrelated merchant connections while another scope changes during an order query', async () => {
    await connected()
    let finish!: (orders: unknown[]) => void
    orders.find.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = service.snapshot(scope.tenantId, scope.merchantId)
    await settle()
    service.invalidate({ ...scope, merchantId: 'other-merchant' })
    service.invalidate({ ...scope, tenantId: 'other-tenant' })
    finish([order])
    await pending
    expect(connection.close).not.toHaveBeenCalled()
    callbacks.message(input('still-connected'))
    expect(memory.snapshot(scope).messages).toHaveLength(1)
  })
  it('does not replay expired or undated HTTP messages after two hours of runtime', async () => {
    await connected()
    const old = input('expired')
    callbacks.message(old)
    jest.useFakeTimers({
      doNotFake: [
        'setTimeout',
        'clearTimeout',
        'setImmediate',
        'clearImmediate',
        'nextTick',
        'performance',
      ],
    })
    jest.setSystemTime(Date.now() + CHAT_TTL_MS + 1000)
    try {
      expect(memory.snapshot(scope).messages).toEqual([])
      const current = input('current', new Date(Date.now()).toISOString())
      adapter.messages.mockResolvedValue([
        old,
        { ...input('undated'), occurredAt: undefined },
        current,
      ])
      callbacks.unread()
      await new Promise((resolve) => {
        setTimeout(resolve, 300)
      })
      expect(memory.snapshot(scope).messages.map((message) => message.text)).toEqual(['current'])
      callbacks.closed()
      jest.setSystemTime(Date.now() + 6000)
      await service.snapshot(scope.tenantId, scope.merchantId)
      await settle()
      // The reconnect baseline uses the same cutoff as unread HTTP retrieval.
      expect(memory.snapshot(scope).messages.map((message) => message.text)).toEqual(['current'])
    } finally {
      jest.useRealTimers()
    }
  })
  it('initializes newly synchronized orders once without polling existing chat bodies', async () => {
    await connected()
    const newOrder = { ...order, id: 'new-order', platformOrderId: 'new-platform-order' }
    orders.find.mockResolvedValue([order, newOrder])
    await service.snapshot(scope.tenantId, scope.merchantId)
    await service.snapshot(scope.tenantId, scope.merchantId)
    expect(adapter.messages).toHaveBeenCalledTimes(2)
    expect(adapter.messages.mock.calls[1][1]).toBe('new-platform-order')
  })
  it('enforces connection capacity when many merchants finish secret resolution concurrently', async () => {
    const finish: Array<(secret: unknown) => void> = []
    secrets.resolve.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish.push(resolve)
        }),
    )
    merchants.findOneBy.mockImplementation(async ({ id }) => ({ ...merchant, id }))
    orders.find.mockResolvedValue([])
    const pending = Array.from({ length: 65 }, (_, index) =>
      service.snapshot(scope.tenantId, `merchant-${index}`),
    )
    await settle()
    expect(finish).toHaveLength(64)
    for (const resolve of finish) resolve({ apiKey: 'test-key', secretKey: 'test-secret' })
    await Promise.all(pending)
    await settle()
    expect(adapter.connect).toHaveBeenCalledTimes(64)
  })
})
