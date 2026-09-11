import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { BusinessScopeService } from '@/apps/admin/modules/business'
import { TelegramController } from '@/apps/admin/modules/telegram/telegram.controller'
import { TelegramBotService } from '@/apps/admin/modules/telegram/telegram-bot.service'
import { TelegramGroupService } from '@/apps/admin/modules/telegram/telegram-group.service'
import { TelegramMemberService } from '@/apps/admin/modules/telegram/telegram-member.service'
import { TelegramSuperAdminService } from '@/apps/admin/modules/telegram/telegram-super-admin.service'
import {
  createAdminContractTestApp,
  expectWrappedSuccess,
} from './helpers/admin-contract-test-app'

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
      ],
    })
  })

  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('creates a bot with a Secret reference and never exposes it', async () => {
    bots.create.mockResolvedValue({ id: 'bot-1', code: 'PAY_MAIN', tokenConfigured: true })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/tg/bots')
      .send({
        tenantId: '00000000-0000-4000-8000-000000000010',
        code: 'PAY_MAIN',
        name: '主支付机器人',
        botType: 'PAYMENT',
        tokenRef: 'env://TELEGRAM_PAY_MAIN_TOKEN',
        capabilities: ['ORDER_QUERY', 'MANUAL_PAYMENT'],
        paymentOrderRequireConfirmation: true,
        batchSubmitRequireConfirmation: true,
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(response.body.data).not.toHaveProperty('tokenRef')
    expect(bots.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ code: 'PAY_MAIN', tokenRef: 'env://TELEGRAM_PAY_MAIN_TOKEN' }),
    )
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
        capabilities: ['ORDER_QUERY', 'MANUAL_PAYMENT'],
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

  it('creates a mapped group member and a tenant-scoped super administrator', async () => {
    members.create.mockResolvedValue({ id: 'member-1' })
    superAdmins.create.mockResolvedValue({ id: 'super-1', scopeType: 'SPECIFIED_GROUPS' })
    const tenantId = '00000000-0000-4000-8000-000000000010'

    await request(app.getHttpServer())
      .post('/v1/sys/tg/members')
      .send({
        tenantId,
        groupId: '00000000-0000-4000-8000-000000000040',
        userId: 8,
        telegramUserId: '987654321',
        role: 'OPERATOR',
        capabilities: ['ORDER_QUERY'],
      })
      .expect(201)
    await request(app.getHttpServer())
      .post('/v1/sys/tg/super-admins')
      .send({
        tenantId,
        userId: 8,
        telegramUserId: '987654321',
        scopeType: 'SPECIFIED_GROUPS',
        groupIds: ['00000000-0000-4000-8000-000000000040'],
      })
      .expect(201)

    expect(members.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ userId: 8, role: 'OPERATOR' }),
    )
    expect(superAdmins.create).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ scopeType: 'SPECIFIED_GROUPS' }),
    )
  })
})
