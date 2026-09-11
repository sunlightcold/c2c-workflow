import type { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TelegramUpdateInboxService } from '@/apps/admin/modules/telegram/telegram-update-inbox.service'
import { TelegramWebhookController } from '@/apps/admin/modules/telegram/telegram-webhook.controller'
import { createAdminContractTestApp, expectWrappedSuccess } from './helpers/admin-contract-test-app'

jest.mock('@/common/decorators', () => ({ Public: () => () => undefined }))

describe('Telegram webhook API contract (e2e)', () => {
  let app: INestApplication
  const inbox = { receive: jest.fn() }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [TelegramWebhookController],
      path: 'tg',
      providers: [{ provide: TelegramUpdateInboxService, useValue: inbox }],
    })
  })
  beforeEach(() => jest.clearAllMocks())
  afterAll(async () => app.close())

  it('normalizes the bot code and forwards the Telegram secret header', async () => {
    inbox.receive.mockResolvedValue({ accepted: true })
    const response = await request(app.getHttpServer())
      .post('/v1/tg/webhooks/pay_main')
      .set('x-telegram-bot-api-secret-token', 'secret-value')
      .send({ update_id: 123 })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(inbox.receive).toHaveBeenCalledWith('PAY_MAIN', 'secret-value', { update_id: 123 })
  })
})
