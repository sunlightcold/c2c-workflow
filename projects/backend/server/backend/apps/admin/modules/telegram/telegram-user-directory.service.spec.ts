import { ActorType, StatusEnum } from '@/common/interfaces'
import { TelegramUserDirectoryService } from './telegram-user-directory.service'

describe('TelegramUserDirectoryService', () => {
  it('returns only active platform or same-tenant users without sensitive fields', async () => {
    const users = {
      find: jest.fn().mockResolvedValue([
        { id: 1, nickname: '平台运营', username: 'platform' },
        { id: 2, nickname: '代理值班员', username: 'tenant-user' },
      ]),
    }
    const service = new TelegramUserDirectoryService(users as never)

    await expect(service.listEligible('tenant-1')).resolves.toEqual([
      { id: 1, nickname: '平台运营', username: 'platform' },
      { id: 2, nickname: '代理值班员', username: 'tenant-user' },
    ])

    const options = users.find.mock.calls[0]?.[0]
    expect(options.select).toEqual({ id: true, nickname: true, username: true })
    expect(options.where).toEqual([
      expect.objectContaining({
        actorType: ActorType.PLATFORM,
        status: StatusEnum.ENABLED,
      }),
      {
        actorType: ActorType.TENANT,
        status: StatusEnum.ENABLED,
        tenantId: 'tenant-1',
      },
    ])
    expect(options.where[0].tenantId).toBeDefined()
  })
})
