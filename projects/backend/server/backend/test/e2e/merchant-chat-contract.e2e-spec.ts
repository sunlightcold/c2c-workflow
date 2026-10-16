jest.mock('nanoid', () => ({ nanoid: () => 'test-id' }))
jest.mock('@/common/decorators', () => {
  const actual = jest.requireActual('@/common/decorators')
  const { createParamDecorator } = jest.requireActual('@nestjs/common')
  return { ...actual, User: createParamDecorator(() => ({ uid: 7, username: 'operator' })) }
})
import request from 'supertest'
import { ForbiddenException, type INestApplication } from '@nestjs/common'
import { MerchantChatController } from '@/apps/admin/modules/merchant-chat/merchant-chat.controller'
import { MerchantChatService } from '@/apps/admin/modules/merchant-chat/merchant-chat.service'
import { ChatAccessService } from '@/apps/admin/modules/merchant-chat/chat-access.service'
import {
  ChatImageLimitInterceptor,
  ChatImageService,
} from '@/apps/admin/modules/merchant-chat/chat-image.service'
import { ChatError } from '@/apps/admin/modules/merchant-chat/chat.types'
import { createAdminContractTestApp, expectWrappedSuccess } from './helpers/admin-contract-test-app'

describe('Merchant live chat HTTP contract', () => {
  const tenantId = '00000000-0000-4000-8000-000000000001'
  const merchantId = '00000000-0000-4000-8000-000000000002'
  const instanceId = '00000000-0000-4000-8000-000000000003'
  const conversationId = '00000000-0000-4000-8000-000000000004'
  const attachmentId = '00000000-0000-4000-8000-000000000005'
  const messageId = '00000000-0000-4000-8000-000000000006'
  const requestId = '00000000-0000-4000-8000-000000000007'
  const chat = { snapshot: jest.fn(), reply: jest.fn(), attachment: jest.fn() }
  const access = { authorize: jest.fn() }
  const images = { acquire: jest.fn(), release: jest.fn() }
  let app: INestApplication
  beforeAll(async () => {
    app = await createAdminContractTestApp({
      path: 'sys',
      controllers: [MerchantChatController],
      providers: [
        { provide: MerchantChatService, useValue: chat },
        { provide: ChatAccessService, useValue: access },
        { provide: ChatImageService, useValue: images },
        ChatImageLimitInterceptor,
      ],
    })
  })
  beforeEach(() => {
    jest.clearAllMocks()
    access.authorize.mockResolvedValue(tenantId)
  })
  afterAll(() => app.close())
  it('returns the bounded current snapshot and rejects revoked access', async () => {
    chat.snapshot.mockResolvedValue({
      instanceId,
      sequence: 1,
      retentionSeconds: 7200,
      merchants: [],
      conversations: [],
      messages: [],
    })
    const response = await request(app.getHttpServer())
      .get('/v1/sys/merchant-chats/live')
      .query({ tenantId, merchantId })
      .expect(200)
    expectWrappedSuccess(response.body)
    expect(chat.snapshot).toHaveBeenCalledWith(tenantId, merchantId)
    access.authorize.mockRejectedValue(new ForbiddenException('无聊天操作权限'))
    await request(app.getHttpServer())
      .get('/v1/sys/merchant-chats/live')
      .query({ tenantId })
      .expect(403)
    expect(chat.snapshot).toHaveBeenCalledTimes(1)
  })
  it('accepts multipart text/image in memory and takes the actor from the session', async () => {
    chat.reply.mockResolvedValue({
      instanceId,
      requestId,
      messages: [{ id: messageId, type: 'TEXT', status: 'UNKNOWN' }],
    })
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchant-chats/live/reply')
      .field('tenantId', tenantId)
      .field('merchantId', merchantId)
      .field('instanceId', instanceId)
      .field('conversationId', conversationId)
      .field('requestId', requestId)
      .field('text', 'reply')
      .attach('image', Buffer.from('test-image'), {
        filename: 'test.png',
        contentType: 'image/png',
      })
      .expect(201)
    expectWrappedSuccess(response.body)
    expect(chat.reply).toHaveBeenCalledWith(
      { tenantId, merchantId },
      expect.objectContaining({ text: 'reply', requestId }),
      7,
      expect.objectContaining({ buffer: Buffer.from('test-image'), mimetype: 'image/png' }),
    )
    expect(access.authorize).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 7 }),
      tenantId,
      true,
    )
    expect(images.release).toHaveBeenCalledTimes(1)
  })
  it('returns stable failure codes and rejects malformed request IDs before sending', async () => {
    chat.reply.mockRejectedValue(new ChatError('CHAT_INSTANCE_CHANGED', '聊天运行窗口已变化'))
    const valid = { tenantId, merchantId, instanceId, conversationId, requestId, text: 'reply' }
    const response = await request(app.getHttpServer())
      .post('/v1/sys/merchant-chats/live/reply')
      .send(valid)
      .expect(409)
    expect(response.body.data).toEqual({ reasonCode: 'CHAT_INSTANCE_CHANGED' })
    await request(app.getHttpServer())
      .post('/v1/sys/merchant-chats/live/reply')
      .send({ ...valid, requestId: 'invalid' })
      .expect(400)
    expect(chat.reply).toHaveBeenCalledTimes(1)
  })
  it('streams a protected non-cacheable image and preserves expiry errors', async () => {
    chat.attachment.mockResolvedValue({ content: Buffer.from('image'), mime: 'image/png' })
    const path = `/v1/sys/merchant-chats/live/messages/${messageId}/attachments/${attachmentId}`
    const response = await request(app.getHttpServer())
      .get(path)
      .query({ tenantId, merchantId, instanceId })
      .expect(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.headers['content-type']).toBe('image/png')
    expect(response.headers['x-content-type-options']).toBe('nosniff')
    expect(chat.attachment).toHaveBeenCalledWith(
      { tenantId, merchantId },
      instanceId,
      messageId,
      attachmentId,
    )
    chat.attachment.mockRejectedValue(new ChatError('CHAT_ATTACHMENT_EXPIRED', '图片已过期', 410))
    const expired = await request(app.getHttpServer())
      .get(path)
      .query({ tenantId, merchantId, instanceId })
      .expect(410)
    expect(expired.body.data.reasonCode).toBe('CHAT_ATTACHMENT_EXPIRED')
  })
})
