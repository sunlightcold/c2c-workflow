import type * as NodeEvents from 'node:events'
jest.mock('ws', () => {
  const { EventEmitter } = jest.requireActual<typeof NodeEvents>('node:events')
  class MockSocket extends EventEmitter {
    static OPEN = 1
    static instances: InstanceType<typeof EventEmitter>[] = []
    readyState = 1
    send = jest.fn((_data: string, callback: (error?: Error) => void) => callback())
    terminate = jest.fn(() => this.emit('close'))
    ping = jest.fn()
    constructor() {
      super()
      MockSocket.instances.push(this)
    }
  }
  return { __esModule: true, default: MockSocket }
})
import Ws from 'ws'
import {
  BinanceChatAdapter,
  requireBinanceChatUrl,
  type BinanceChatConnection,
} from './binance-chat.adapter'
import type { BinanceCredentials } from '../c2c-platform/binance-c2c.client'

describe('Binance chat protocol transport', () => {
  const client = { chatRequest: jest.fn() }
  const agents = { httpsAgent: {}, destroy: jest.fn() }
  const network = { forMerchant: jest.fn().mockResolvedValue(agents) }
  const scope = { tenantId: 'tenant', merchantId: 'merchant' }
  const credentialInput = { timeoutMs: 15000, proxyScope: scope }
  const credentials = credentialInput as BinanceCredentials
  const handlers = {
    active: jest.fn(),
    message: jest.fn(),
    unread: jest.fn(),
    opened: jest.fn(),
    closed: jest.fn(),
    invalid: jest.fn(),
  }
  type TestSocket = Ws & { send: jest.Mock; terminate: jest.Mock }
  const sockets = Ws as unknown as { instances: TestSocket[] }
  let adapter: BinanceChatAdapter
  let connection: BinanceChatConnection | undefined
  beforeEach(() => {
    jest.useFakeTimers()
    jest.clearAllMocks()
    sockets.instances.length = 0
    handlers.active.mockReturnValue(true)
    client.chatRequest.mockResolvedValue({
      data: {
        chatWssUrl: 'wss://im.binance.com:443/chat',
        listenKey: 'test-listen-key',
        listenToken: 'test-token',
      },
    })
    adapter = new BinanceChatAdapter(client as never, network as never)
  })
  afterEach(() => {
    connection?.close()
    connection = undefined
    jest.useRealTimers()
  })
  it('does not mark a local write as sent; only matching self echo confirms delivery', async () => {
    connection = await adapter.connect(credentials, handlers)
    const socket = sockets.instances[0]
    socket.emit('open')
    const result = connection.send('20476365073825144832', { type: 'text', content: 'reply' })
    const frame = JSON.parse(socket.send.mock.calls[0][0])
    expect(frame).toMatchObject({
      orderNo: '20476365073825144832',
      type: 'text',
      content: 'reply',
      self: true,
      clientType: 'web',
      sendStatus: 0,
    })
    let completed = false
    result.then(() => {
      completed = true
    })
    await Promise.resolve()
    expect(completed).toBe(false)
    socket.emit('message', Buffer.from(JSON.stringify({ ...frame, self: false, id: 'other' })))
    await Promise.resolve()
    expect(completed).toBe(false)
    socket.emit('message', Buffer.from(JSON.stringify(frame)))
    await expect(result).resolves.toBe('SENT')
    expect(network.forMerchant).toHaveBeenCalledWith(scope)
  })
  it('keeps timeout, disconnect and synchronous write failure UNKNOWN without retry', async () => {
    connection = await adapter.connect(credentials, handlers)
    const first = connection.send('order', { type: 'text', content: 'reply' })
    jest.advanceTimersByTime(10_001)
    await expect(first).resolves.toBe('UNKNOWN')
    const second = connection.send('order', { type: 'image', imageUrl: 'protected' })
    connection.close()
    await expect(second).resolves.toBe('UNKNOWN')
    connection = await adapter.connect(credentials, handlers)
    sockets.instances[1].send.mockImplementation(() => {
      throw new Error('socket failure')
    })
    await expect(connection.send('order', { type: 'text', content: 'reply' })).resolves.toBe(
      'UNKNOWN',
    )
    expect(sockets.instances[1].send).toHaveBeenCalledTimes(1)
  })
  it('handles unread notifications and large identifiers and stops before connecting after invalidation', async () => {
    connection = await adapter.connect(credentials, handlers)
    sockets.instances[0].emit(
      'message',
      Buffer.from(
        '{"data":[{"id":20476365073825144833,"orderNo":20476365073825144832,"type":"text","content":"new"}]}',
      ),
    )
    expect(handlers.message).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceMessageId: '20476365073825144833',
        orderNo: '20476365073825144832',
      }),
    )
    sockets.instances[0].emit(
      'message',
      Buffer.from('{"type":"statistics","subType":"unreadIntegratedChatCount","totalCount":1}'),
    )
    expect(handlers.unread).toHaveBeenCalledTimes(1)
    handlers.active.mockReturnValue(false)
    await expect(adapter.connect(credentials, handlers)).rejects.toThrow('配置已变化')
    expect(sockets.instances).toHaveLength(1)
  })
})

describe('Binance chat endpoint isolation', () => {
  afterEach(() => jest.restoreAllMocks())
  it('allows only the local Mock pair in development', () => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: 'development' })
    expect(
      requireBinanceChatUrl('ws://127.0.0.1:13002/chat', 'http://127.0.0.1:13002').protocol,
    ).toBe('ws:')
    expect(() =>
      requireBinanceChatUrl('ws://127.0.0.1:13002/chat', 'https://api.binance.com'),
    ).toThrow()
    expect(() =>
      requireBinanceChatUrl('ws://127.0.0.1:13003/chat', 'http://127.0.0.1:13002'),
    ).toThrow()
    expect(() =>
      requireBinanceChatUrl('ws://evil.example/chat', 'http://127.0.0.1:13002'),
    ).toThrow()
  })
  it.each(['production', 'test', undefined])('rejects local Mock in %s', (mode) => {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: mode })
    expect(() =>
      requireBinanceChatUrl('ws://127.0.0.1:13002/chat', 'http://127.0.0.1:13002'),
    ).toThrow()
    expect(requireBinanceChatUrl('wss://im.binance.com:443/chat').hostname).toBe('im.binance.com')
  })
})
