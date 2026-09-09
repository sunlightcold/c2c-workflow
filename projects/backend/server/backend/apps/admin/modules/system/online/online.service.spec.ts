/// <reference types="jest" />

import { SysOnlineUserStatus } from '@/apps/admin/database'
import { EVENT_KEYS } from '@admin/modules/event-emitter'
import { OnlineService } from './online.service'

jest.mock('@/apps/admin/database', () => ({
  SysAccessTokenEntity: class MockSysAccessTokenEntity {},
  SysOnlineUserEntity: class MockSysOnlineUserEntity {},
  SysOnlineUserStatus: {
    OFFLINE: 'offline',
    ONLINE: 'online',
  },
}))

jest.mock('@/common/dto', () => ({
  toPaginationParams: jest.fn((data) => {
    const { pageIndex, pageSize, ...params } = data
    return {
      paginateOptions: { limit: pageSize, page: pageIndex },
      params,
    }
  }),
}))

jest.mock('@/common/utils', () => ({
  getConfig: jest.fn().mockReturnValue({ accessTokenExpiresIn: 3600 }),
  isIPv46: jest.fn().mockReturnValue(true),
}))

jest.mock('nestjs-typeorm-paginate', () => ({
  paginate: jest.fn().mockResolvedValue({ items: [], meta: {} }),
}))

describe('OnlineService', () => {
  const fixedNow = new Date('2026-05-21T08:00:00.000Z')

  let onlineUserRepository: {
    createQueryBuilder: jest.Mock
    delete: jest.Mock
    findOneBy: jest.Mock
    findOne: jest.Mock
    save: jest.Mock
    update: jest.Mock
  }
  let accessToken: {
    id: string
    value: string
  }
  let accessTokenEntity: {
    delete: jest.Mock
    findOneBy: jest.Mock
  }
  let jwtService: {
    getAccessToken: jest.Mock
    verifyAsync: jest.Mock
  }
  let cacheService: {
    delAuthToken: jest.Mock
    setTokenBlacklist: jest.Mock
  }
  let eventEmitter: {
    emit: jest.Mock
  }
  let service: OnlineService

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(fixedNow)

    onlineUserRepository = {
      createQueryBuilder: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    }
    accessToken = {
      id: 'token-row-1',
      value: 'jwt-token',
    }
    accessTokenEntity = {
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
      findOneBy: jest.fn().mockResolvedValue(accessToken),
    }
    jwtService = {
      getAccessToken: jest.fn().mockResolvedValue(accessToken),
      verifyAsync: jest.fn().mockResolvedValue({
        exp: Math.floor(fixedNow.getTime() / 1000) + 300,
        uid: 7,
        username: 'alice',
      }),
    }
    cacheService = {
      delAuthToken: jest.fn().mockResolvedValue(undefined),
      setTokenBlacklist: jest.fn().mockResolvedValue(undefined),
    }
    eventEmitter = {
      emit: jest.fn(),
    }

    service = new OnlineService()
    Object.assign(service as never, {
      onlineUserRepository,
      accessTokenEntity,
      jwtService,
      cacheService,
      eventEmitter,
    })
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('revokes the selected online session and marks it offline', async () => {
    onlineUserRepository.findOne.mockResolvedValue({
      accessToken: { id: 'token-row-1', value: 'jwt-token' },
      id: 'online-row-1',
    })

    const result = await service.kick('online-row-1')

    expect(cacheService.setTokenBlacklist).toHaveBeenCalledWith('jwt-token', 300)
    expect(cacheService.delAuthToken).toHaveBeenCalledWith(7)
    expect(accessTokenEntity.delete).toHaveBeenCalledWith({ value: 'jwt-token' })
    expect(onlineUserRepository.delete).toHaveBeenCalledWith('online-row-1')
    expect(eventEmitter.emit).toHaveBeenCalledWith(EVENT_KEYS.ADMIN_SESSION_REVOKED, {
      token: 'jwt-token',
      userId: 7,
    })
    expect(result).toEqual({ revoked: true })
  })

  it('still clears the selected online row when the JWT can no longer be verified', async () => {
    onlineUserRepository.findOne.mockResolvedValue({
      accessToken: { id: 'token-row-1', value: 'expired-token' },
      id: 'online-row-1',
    })
    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'))

    const result = await service.kick('online-row-1')

    expect(cacheService.setTokenBlacklist).not.toHaveBeenCalled()
    expect(cacheService.delAuthToken).not.toHaveBeenCalled()
    expect(accessTokenEntity.delete).toHaveBeenCalledWith({ value: 'expired-token' })
    expect(onlineUserRepository.delete).toHaveBeenCalledWith('online-row-1')
    expect(eventEmitter.emit).toHaveBeenCalledWith(EVENT_KEYS.ADMIN_SESSION_REVOKED, {
      token: 'expired-token',
      userId: undefined,
    })
    expect(result).toEqual({ revoked: true })
  })

  it('does not let Redis blacklist failures block persistent session revocation', async () => {
    onlineUserRepository.findOne.mockResolvedValue({
      accessToken: { id: 'token-row-1', value: 'jwt-token' },
      id: 'online-row-1',
    })
    cacheService.setTokenBlacklist.mockRejectedValue(new Error('redis unavailable'))

    const result = await service.kick('online-row-1')

    expect(accessTokenEntity.delete).toHaveBeenCalledWith({ value: 'jwt-token' })
    expect(onlineUserRepository.delete).toHaveBeenCalledWith('online-row-1')
    expect(eventEmitter.emit).toHaveBeenCalledWith(EVENT_KEYS.ADMIN_SESSION_REVOKED, {
      token: 'jwt-token',
      userId: 7,
    })
    expect(result).toEqual({ revoked: true })
  })

  it('keeps an existing token session online when the browser reconnects', async () => {
    onlineUserRepository.findOneBy.mockResolvedValue({
      id: 'online-row-1',
      loginAt: new Date('2026-05-21T07:30:00.000Z'),
      status: SysOnlineUserStatus.ONLINE,
    })

    await service.recordSessionClient('jwt-token', 'Mozilla/5.0', '127.0.0.1')

    expect(onlineUserRepository.update).toHaveBeenCalledWith('online-row-1', {
      agent: 'Mozilla/5.0',
      browser: expect.any(String),
      city: 'unknown',
      country: 'unknown',
      ip: '127.0.0.1',
      os: expect.any(String),
      region: 'unknown',
      status: SysOnlineUserStatus.ONLINE,
    })
    expect(onlineUserRepository.update).not.toHaveBeenCalledWith(
      'online-row-1',
      expect.objectContaining({
        loginAt: fixedNow,
        status: SysOnlineUserStatus.ONLINE,
      }),
    )
    expect(onlineUserRepository.save).not.toHaveBeenCalled()
  })

  it('applies the token session status filter when listing sessions', async () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
    }
    onlineUserRepository.createQueryBuilder.mockReturnValue(queryBuilder)

    await service.filter({
      pageIndex: 1,
      pageSize: 10,
      status: SysOnlineUserStatus.ONLINE,
    })

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('online.status = :status', {
      status: SysOnlineUserStatus.ONLINE,
    })
  })

  it('only lists sessions that still have a persisted token row', async () => {
    const queryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
    }
    onlineUserRepository.createQueryBuilder.mockReturnValue(queryBuilder)

    await service.filter({ pageIndex: 1, pageSize: 10 })

    expect(queryBuilder.innerJoin).toHaveBeenCalledWith('online.accessToken', 'accessToken')
  })

  it('marks an existing token session offline when all sockets are disconnected', async () => {
    onlineUserRepository.findOneBy.mockResolvedValue({
      id: 'online-row-1',
    })

    await service.markSessionDisconnected('jwt-token')

    expect(onlineUserRepository.update).toHaveBeenCalledWith('online-row-1', {
      logoutAt: fixedNow,
      status: SysOnlineUserStatus.OFFLINE,
    })
  })
})
