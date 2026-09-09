/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysAccessTokenEntity: class MockSysAccessTokenEntity {},
  SysOnlineUserEntity: class MockSysOnlineUserEntity {},
  SysTaskSource: {
    Custom: 'custom',
    System: 'system',
  },
}))

jest.mock('../../../client-error', () => ({
  CLIENT_ERROR_RETENTION_DAYS: 30,
  ClientErrorService: class ClientErrorService {},
}))

import { SysAccessTokenEntity, SysOnlineUserEntity } from '@/apps/admin/database'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SystemMaintenanceJob } from './system-maintenance.job'
import { ClientErrorService } from '../../../client-error'

describe('SystemMaintenanceJob', () => {
  let accessTokenRepository: {
    find: jest.Mock
    delete: jest.Mock
  }
  let onlineUserRepository: {
    createQueryBuilder: jest.Mock
  }
  let job: SystemMaintenanceJob
  const clientErrorService = { deleteCreatedBefore: jest.fn() }

  beforeEach(async () => {
    accessTokenRepository = {
      find: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 2 }),
    }
    onlineUserRepository = {
      createQueryBuilder: jest.fn(),
    }

    const module = await Test.createTestingModule({
      providers: [
        SystemMaintenanceJob,
        {
          provide: getRepositoryToken(SysAccessTokenEntity),
          useValue: accessTokenRepository,
        },
        { provide: ClientErrorService, useValue: clientErrorService },
        {
          provide: getRepositoryToken(SysOnlineUserEntity),
          useValue: onlineUserRepository,
        },
      ],
    }).compile()

    job = module.get(SystemMaintenanceJob)
  })

  it('deletes client errors older than the retention window', async () => {
    clientErrorService.deleteCreatedBefore.mockResolvedValue(7)

    await expect(job.clearExpiredClientErrors()).resolves.toEqual({
      deletedClientErrors: 7,
      taskSource: 'system',
    })

    expect(clientErrorService.deleteCreatedBefore).toHaveBeenCalledWith(expect.any(Date))
  })

  it('skips cleanup when no expired tokens exist', async () => {
    accessTokenRepository.find.mockResolvedValue([])

    await expect(job.clearExpiredAdminTokenSessions()).resolves.toEqual({
      deletedAccessTokens: 0,
      deletedOnlineUsers: 0,
      taskSource: 'system',
    })

    expect(onlineUserRepository.createQueryBuilder).not.toHaveBeenCalled()
    expect(accessTokenRepository.delete).not.toHaveBeenCalled()
  })

  it('deletes expired online rows and access tokens together', async () => {
    accessTokenRepository.find.mockResolvedValue([{ id: 'token-1' }, { id: 'token-2' }])
    const deleteQuery = {
      delete: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 3 }),
    }
    onlineUserRepository.createQueryBuilder.mockReturnValue(deleteQuery)

    await expect(job.clearExpiredAdminTokenSessions()).resolves.toEqual({
      deletedAccessTokens: 2,
      deletedOnlineUsers: 3,
      taskSource: 'system',
    })

    expect(onlineUserRepository.createQueryBuilder).toHaveBeenCalledTimes(1)
    expect(deleteQuery.where).toHaveBeenCalledWith('tokenId IN (:...tokenIds)', {
      tokenIds: ['token-1', 'token-2'],
    })
    expect(accessTokenRepository.delete).toHaveBeenCalledWith({
      id: expect.objectContaining({ _type: 'in', _value: ['token-1', 'token-2'] }),
    })
  })
})
