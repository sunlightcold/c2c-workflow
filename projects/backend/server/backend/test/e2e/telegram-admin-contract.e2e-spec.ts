import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { BusinessScopeService } from '@/apps/admin/modules/business'
import { TelegramController } from '@/apps/admin/modules/telegram/telegram.controller'
import { TelegramBotService } from '@/apps/admin/modules/telegram/telegram-bot.service'
import { TelegramGroupService } from '@/apps/admin/modules/telegram/telegram-group.service'
import { TelegramMemberService } from '@/apps/admin/modules/telegram/telegram-member.service'
import { TelegramSuperAdminService } from '@/apps/admin/modules/telegram/telegram-super-admin.service'
import { TelegramBotRuntimeService } from '@/apps/admin/modules/telegram/telegram-bot-runtime.service'
import { createAdminContractTestApp, expectWrappedSuccess } from './helpers/admin-contract-test-app'

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  User: () => () => undefined,
  definePermission: (prefix: string, actions: string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

describe('Telegram administration API contract (e2e)', () => {
  let app: INestApplication
  const scope = { resolveTenantId: jest.fn().mockReturnValue('tenant-1') }
  const bots = {
    create: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    setStatus: jest.fn(),
    update: jest.fn(),
  }
  const groups = {
    approve: jest.fn(),
    createChallenge: jest.fn(),
    list: jest.fn(),
    unbind: jest.fn(),
    update: jest.fn(),
  }
  const members = {
    create: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    setStatus: jest.fn(),
    update: jest.fn(),
  }
  const superAdmins = {
    create: jest.fn(),
    list: jest.fn(),
    remove: jest.fn(),
    setStatus: jest.fn(),
    update: jest.fn(),
  }
  const runtime = {
    check: jest.fn(),
    getStatus: jest.fn().mockReturnValue({
      state: 'ONLINE',
      runtimeRunning: true,
      checkedAt: '2026-09-13T00:00:00.000Z',
      message: 'Telegram 连接正常，机器人正在运行',
    }),
    reloadIfRunning: jest.fn(),
    restart: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    stopByCode: jest.fn(),
  }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [TelegramController],
      path: 'sys/tg',
      providers: [
        { provide: BusinessScopeService, useValue: scope },
        { provide: TelegramBotService, useValue: bots },
        { provide: TelegramGroupService, useValue: groups },
        { provide: TelegramMemberService, useValue: members },
        { provide: TelegramSuperAdminService, useValue: superAdmins },
        { provide: TelegramBotRuntimeService, useValue: runtime },
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('accepts a Bot Token when creating a bot and never exposes it', async () => {
    bots.create.mockResolvedValue({ id: 'bot-1', code: 'PAY_MAIN', tokenConfigured: true })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/tg/bots')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        name: '主支付机器人',
        botType: 'PAYMENT',
        token: '1234567890:AAabcdefghijklmnopQRST_uvwx',
        capabilities: ['ORDER_QUERY', 'ALIPAY_BATCH_PAYMENT'],
        paymentOrderRequireConfirmation: true,
        batchSubmitRequireConfirmation: true,
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('token')
    expect(response.body.data).not.toHaveProperty('tokenRef')
    expect(bots.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ token: '1234567890:AAabcdefghijklmnopQRST_uvwx' }),
    )
    expect(bots.create.mock.calls[0][1]).not.toHaveProperty('code')
    expect(runtime.start).toHaveBeenCalledWith('tenant-1', 'bot-1')
  })

  it('exposes runtime status and controls the robot lifecycle', async () => {
    bots.list.mockResolvedValue({
      items: [{ id: 'bot-1', code: 'PAY_MAIN' }],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    runtime.check.mockResolvedValue({ state: 'ONLINE', runtimeRunning: false })
    runtime.start.mockResolvedValue({ state: 'CONNECTING', runtimeRunning: true })
    runtime.stop.mockResolvedValue({ state: 'NOT_STARTED', runtimeRunning: false })
    runtime.restart.mockResolvedValue({ state: 'CONNECTING', runtimeRunning: true })
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const id = '00000000-0000-4000-8000-000000000020'

    const list = await request(app.getHttpServer())
      .get('/v1/sys/tg/bots')
      .query({ tenantId, page: 1, pageSize: 20 })
      .expect(200)
    expect(list.body.data.items[0].runtime).toMatchObject({ state: 'ONLINE', runtimeRunning: true })

    await request(app.getHttpServer())
      .post(`/v1/sys/tg/bots/${id}/runtime/check`)
      .query({ tenantId })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/sys/tg/bots/${id}/runtime/start`)
      .query({ tenantId })
      .expect(200)
    await request(app.getHttpServer())
      .post(`/v1/sys/tg/bots/${id}/runtime/stop`)
      .query({ tenantId })
      .expect(200)

    const restarted = await request(app.getHttpServer())
      .post(`/v1/sys/tg/bots/${id}/runtime/restart`)
      .query({ tenantId })
      .expect(200)
    expect(restarted.body.data).toMatchObject({ state: 'CONNECTING', runtimeRunning: true })
    expect(runtime.check).toHaveBeenCalledWith('tenant-1', id)
    expect(runtime.start).toHaveBeenCalledWith('tenant-1', id)
    expect(runtime.stop).toHaveBeenCalledWith('tenant-1', id)
    expect(runtime.restart).toHaveBeenCalledWith('tenant-1', id)
  })

  it('stops a deleted robot only after deletion succeeds', async () => {
    bots.remove.mockResolvedValue('BOT202609130001')
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const id = '00000000-0000-4000-8000-000000000020'

    await request(app.getHttpServer())
      .delete(`/v1/sys/tg/bots/${id}`)
      .query({ tenantId })
      .expect(200)

    expect(bots.remove).toHaveBeenCalledWith('tenant-1', id)
    expect(runtime.stopByCode).toHaveBeenCalledWith('BOT202609130001')
  })

  it('creates a pending group challenge and approves the captured Telegram group', async () => {
    groups.createChallenge.mockResolvedValue({
      id: 'group-1',
      bindingState: 'PENDING',
      verificationCode: '382914',
    })
    groups.approve.mockResolvedValue({ id: 'group-1', bindingState: 'ACTIVE' })
    const tenantId = '00000000-0000-4000-8000-000000000010'
    const groupId = '00000000-0000-4000-8000-000000000040'
    const created = await request(app.getHttpServer())
      .post('/v1/sys/tg/groups')
      .send({
        tenantId,
        botId: '00000000-0000-4000-8000-000000000020',
        merchantId: '00000000-0000-4000-8000-000000000030',
        name: '支付一群',
        paymentScene: 'BOT_MANUAL',
        capabilities: ['ORDER_QUERY', 'ALIPAY_BATCH_PAYMENT'],
      })
      .expect(201)
    expectWrappedSuccess(created.body)
    expect(created.body.data.verificationCode).toBe('382914')

    await request(app.getHttpServer())
      .post(`/v1/sys/tg/groups/${groupId}/approve`)
      .send({ tenantId, chatId: '-1001234567890', chatName: '支付一群', chatType: 'supergroup' })
      .expect(201)
    expect(groups.approve).toHaveBeenCalledWith(
      'tenant-1',
      groupId,
      expect.objectContaining({ chatId: '-1001234567890' }),
    )
  })

  it('creates Telegram identities scoped to a tenant', async () => {
    members.create.mockResolvedValue({ id: 'member-1' })
    superAdmins.create.mockResolvedValue({ id: 'super-1', scopeType: 'SPECIFIED_GROUPS' })
    const tenantId = '00000000-0000-4000-8000-000000000010'

    await request(app.getHttpServer())
      .post('/v1/sys/tg/members')
      .send({
        tenantId,
        groupId: '00000000-0000-4000-8000-000000000040',
        telegramUserId: '987654321',
        role: 'OPERATOR',
        capabilities: ['ORDER_QUERY'],
      })
      .expect(201)
    await request(app.getHttpServer())
      .post('/v1/sys/tg/super-admins')
      .send({
        tenantId,
        telegramUserId: '987654321',
        scopeType: 'SPECIFIED_GROUPS',
        groupIds: ['00000000-0000-4000-8000-000000000040'],
      })
      .expect(201)

    expect(members.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ telegramUserId: '987654321', role: 'OPERATOR' }),
    )
    expect(superAdmins.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scopeType: 'SPECIFIED_GROUPS' }),
    )
  })
})
