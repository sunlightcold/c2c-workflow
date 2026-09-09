import request from 'supertest'
import type { INestApplication } from '@nestjs/common'

jest.mock('@admin/database', () => ({
  SysStorageBindingEntity: class SysStorageBindingEntity {},
  SysStorageChannelEntity: class SysStorageChannelEntity {},
  SysStorageChannelProvider: { S3_COMPATIBLE: 's3_compatible' },
  SysStorageChannelStatus: { ACTIVE: 'active', DISABLED: 'disabled', ERROR: 'error' },
}))

jest.mock('@/common/decorators', () => ({
  Permission: () => () => undefined,
  definePermission: (prefix: string, actions: string[]) =>
    Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
}))

import { StorageBindingService } from '@/apps/admin/modules/system/storage/storage-binding.service'
import { StorageChannelService } from '@/apps/admin/modules/system/storage/storage-channel.service'
import { StorageController } from '@/apps/admin/modules/system/storage/storage.controller'
import {
  createAdminContractTestApp,
  expectWrappedError,
  expectWrappedSuccess,
} from './helpers/admin-contract-test-app'

describe('Storage administration API contract (e2e)', () => {
  let app: INestApplication
  const channelService = {
    list: jest.fn(),
    create: jest.fn(),
    test: jest.fn(),
  }
  const bindingService = {
    listPurposes: jest.fn(),
  }

  beforeAll(async () => {
    app = await createAdminContractTestApp({
      controllers: [StorageController],
      path: 'sys',
      providers: [
        { provide: StorageChannelService, useValue: channelService },
        { provide: StorageBindingService, useValue: bindingService },
      ],
    })
  })

  beforeEach(() => {
    jest.clearAllMocks()
    channelService.list.mockResolvedValue([
      {
        code: 'r2-public',
        hasSecret: true,
        id: '00000000-0000-4000-8000-000000000001',
        name: 'R2 Public',
        status: 'active',
      },
    ])
    bindingService.listPurposes.mockResolvedValue([
      { bindingChannelId: null, code: 'system.avatar', group: 'system' },
    ])
    channelService.test.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      lastCheckMessage: 'Authenticated and public access ok',
      status: 'disabled',
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('exposes channels and purposes through the system storage route', async () => {
    const channels = await request(app.getHttpServer()).get('/v1/sys/storage/channels').expect(200)
    expectWrappedSuccess(channels.body)
    expect(channels.body.data).toEqual([
      expect.objectContaining({ code: 'r2-public', hasSecret: true, name: 'R2 Public' }),
    ])

    const purposes = await request(app.getHttpServer()).get('/v1/sys/storage/purposes').expect(200)
    expectWrappedSuccess(purposes.body)
    expect(purposes.body.data).toEqual([
      expect.objectContaining({ bindingChannelId: null, code: 'system.avatar' }),
    ])
  })

  it('validates storage channel creation before invoking the service', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/storage/channels')
      .send({ code: 'bad' })
      .expect(400)
    expectWrappedError(response.body, 400)
    expect(channelService.create).not.toHaveBeenCalled()
  })

  it('exposes the complete channel access test through the system route', async () => {
    const channelId = '00000000-0000-4000-8000-000000000001'
    const response = await request(app.getHttpServer())
      .post(`/v1/sys/storage/channels/${channelId}/test`)
      .expect(201)

    expectWrappedSuccess(response.body)
    expect(response.body.data).toEqual(
      expect.objectContaining({
        lastCheckMessage: 'Authenticated and public access ok',
        status: 'disabled',
      }),
    )
    expect(channelService.test).toHaveBeenCalledWith(channelId)
  })
})
