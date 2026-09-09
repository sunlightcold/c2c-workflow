/// <reference types="jest" />

jest.mock('@/common/utils', () => ({
  getConfig: jest.fn().mockReturnValue({ accessTokenExpiresIn: 3600 }),
}))

jest.mock('@/apps/admin/database', () => ({
  SysAccessTokenEntity: class MockSysAccessTokenEntity {},
}))

import { IJwtService } from './jwt.service'

describe('IJwtService', () => {
  let accessTokenRepository: {
    findOneBy: jest.Mock
  }
  let jwtService: {
    verifyAsync: jest.Mock
  }
  let cacheService: {
    getTokenBlacklist: jest.Mock
  }
  let service: IJwtService

  beforeEach(() => {
    accessTokenRepository = {
      findOneBy: jest.fn(),
    }
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ uid: 1, username: 'alice' }),
    }
    cacheService = {
      getTokenBlacklist: jest.fn(),
    }

    service = new IJwtService()
    Object.assign(service as never, {
      accessTokenRepository,
      cacheService,
      jwtService,
    })
  })

  it('treats a signed JWT as invalid when its persisted session row is missing', async () => {
    accessTokenRepository.findOneBy.mockResolvedValue(null)

    await expect(service.checkToken('signed-token')).resolves.toBe(false)

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('signed-token', expect.any(Object))
    expect(accessTokenRepository.findOneBy).toHaveBeenCalledWith({ value: 'signed-token' })
  })

  it('treats a blacklisted token as invalid even when the database row still exists', async () => {
    accessTokenRepository.findOneBy.mockResolvedValue({ id: 'token-row-1' })
    cacheService.getTokenBlacklist.mockResolvedValue('signed-token')

    await expect(service.checkToken('signed-token')).resolves.toBe(false)
  })

  it('preserves cache failures instead of treating a valid token as unauthenticated', async () => {
    cacheService.getTokenBlacklist.mockRejectedValue(new Error('Redis unavailable'))

    await expect(service.checkToken('signed-token')).rejects.toThrow('Redis unavailable')
  })
})
