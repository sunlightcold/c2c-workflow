jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))
import { Subject } from 'rxjs'
import type { Socket } from 'socket.io'
import { MerchantChatGateway } from './merchant-chat.gateway'
import type { ChatEvent } from './chat.types'

describe('Live chat subscriptions', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001'
  const events = new Subject<ChatEvent>()
  const access = { authorize: jest.fn() }
  const chat = { memory: { events }, snapshot: jest.fn() }
  const jwt = {
    checkToken: jest.fn().mockResolvedValue(true),
    verifyAsync: jest.fn().mockResolvedValue({ uid: 1 }),
  }
  let gateway: MerchantChatGateway
  let socket: Socket
  const settle = () =>
    new Promise<void>((resolve) => {
      setImmediate(resolve)
    })
  beforeEach(() => {
    jest.clearAllMocks()
    access.authorize.mockResolvedValue(tenantId)
    chat.snapshot.mockResolvedValue({ instanceId: 'runtime', sequence: 0, messages: [] })
    const mockSocket = {
      id: 'socket',
      data: {},
      connected: true,
      handshake: { auth: { token: 'test-token' } },
      conn: { transport: { writable: true } },
      emit: jest.fn(),
    }
    socket = mockSocket as unknown as Socket
    gateway = new MerchantChatGateway(chat as never, access as never, jwt as never)
    gateway.onModuleInit()
  })
  afterEach(() => gateway.onModuleDestroy())
  const event: ChatEvent = {
    instanceId: 'runtime',
    sequence: 1,
    type: 'expired',
    tenantId,
    merchantId: 'merchant',
    conversationId: 'conversation',
  }
  it('does not restore an old subscription after unsubscribe while authorization is pending', async () => {
    let authorize!: (tenant: string) => void
    access.authorize.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          authorize = resolve
        }),
    )
    const pending = gateway.subscribe(socket, { tenantId })
    await settle()
    gateway.unsubscribe(socket)
    authorize(tenantId)
    expect(await pending).toEqual({ ok: false })
    events.next(event)
    await settle()
    expect(socket.emit).not.toHaveBeenCalled()
  })
  it('prevents a slow old subscribe from replacing a newer subscription', async () => {
    let authorize!: (tenant: string) => void
    access.authorize.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          authorize = resolve
        }),
    )
    const old = gateway.subscribe(socket, { tenantId })
    await settle()
    await expect(
      gateway.subscribe(socket, { tenantId, merchantId: '00000000-0000-4000-8000-000000000002' }),
    ).resolves.toMatchObject({ ok: true })
    authorize(tenantId)
    await old
    events.next(event)
    await settle()
    expect(socket.emit).not.toHaveBeenCalled()
  })
  it('rechecks permission for delivery and idle subscribers', async () => {
    await gateway.subscribe(socket, { tenantId })
    events.next({ ...event, tenantId: 'other' })
    await settle()
    expect(socket.emit).not.toHaveBeenCalled()
    access.authorize.mockRejectedValue(new Error('revoked'))
    events.next(event)
    await settle()
    expect(socket.emit).toHaveBeenCalledWith('merchant-chat.invalidated', {
      reasonCode: 'CHAT_ACCESS_REVOKED',
    })
    await gateway.revalidate()
    expect(socket.emit).toHaveBeenCalledTimes(1)
  })
  it('revokes a slow transport instead of building an unbounded network buffer', async () => {
    await gateway.subscribe(socket, { tenantId })
    socket.conn.transport.writable = false
    events.next(event)
    await settle()
    expect(socket.emit).toHaveBeenCalledWith('merchant-chat.invalidated', {
      reasonCode: 'CHAT_RESYNC_REQUIRED',
    })
    events.next({ ...event, sequence: 2 })
    await settle()
    expect(socket.emit).toHaveBeenCalledTimes(1)
  })
})
