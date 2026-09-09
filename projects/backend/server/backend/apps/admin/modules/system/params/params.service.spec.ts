/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysParamsEntity: class MockSysParamsEntity {},
  SysParamsSource: {
    Custom: 'custom',
    System: 'system',
  },
  SysParamsTypeEnum: {
    System: 1,
    Normal: 2,
  },
}))

jest.mock('@/common/constants', () => ({
  ErrorEnum: {
    PARAM_SYSTEM_LOCKED: '1401:系统参数不允许手动修改结构',
  },
  SystemParamsKey: {
    StaticServerUrl: 'staticServerUrl',
  },
}))

jest.mock('@/common/interfaces', () => ({
  StatusEnum: {
    DISABLED: 0,
    ENABLED: 1,
  },
}))

jest.mock('@/common/utils', () => ({
  getConfig: jest.fn(() => ({
    staticServerUrl: 'http://localhost:3001',
  })),
}))

jest.mock('@/common/dto', () => ({
  toPaginationParams: jest.fn((data) => ({
    paginateOptions: { limit: data.pageSize, page: data.pageIndex },
    params: data,
  })),
}))

jest.mock('nestjs-typeorm-paginate', () => ({
  paginate: jest.fn().mockResolvedValue({ items: [], meta: {} }),
}))

import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { SysParamsEntity } from '@/apps/admin/database'
import { CacheService } from '@admin/modules/cache'
import { ParamsService } from './params.service'

describe('ParamsService', () => {
  let repository: {
    find: jest.Mock
    findOne: jest.Mock
    manager: { transaction: jest.Mock }
    save: jest.Mock
    update: jest.Mock
  }
  let cacheService: {
    delAllSystemParams: jest.Mock
    setSystemParams: jest.Mock
    getSystemParams: jest.Mock
    delSystemParams: jest.Mock
  }
  let service: ParamsService

  beforeEach(async () => {
    repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      manager: { transaction: jest.fn() },
      save: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    }
    repository.manager.transaction.mockImplementation((work: (manager: unknown) => Promise<void>) =>
      work({ update: repository.update }),
    )
    cacheService = {
      delAllSystemParams: jest.fn().mockResolvedValue(undefined),
      setSystemParams: jest.fn().mockResolvedValue(undefined),
      getSystemParams: jest.fn().mockResolvedValue(undefined),
      delSystemParams: jest.fn().mockResolvedValue(undefined),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        ParamsService,
        { provide: getRepositoryToken(SysParamsEntity), useValue: repository },
        { provide: CacheService, useValue: cacheService },
      ],
    }).compile()

    service = moduleRef.get(ParamsService)
  })

  it('registers staticServerUrl as a locked system parameter', async () => {
    await service.syncSystemParams()

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'staticServerUrl',
        source: 'system',
        locked: 1,
        value: 'http://localhost:3001',
      }),
    )
  })

  it('rejects structural updates for locked system parameters', async () => {
    repository.findOne.mockResolvedValueOnce({
      id: 1,
      key: 'staticServerUrl',
      value: '/public',
      source: 'system',
      locked: 1,
    })

    await expect(service.update(1, { key: 'other' } as any)).rejects.toThrow(
      '1401:系统参数不允许手动修改结构',
    )
  })

  it('updates related system parameters in one transaction', async () => {
    await service.updateByKeys([
      { key: 'first', value: 'one' },
      { key: 'second', value: 'two' },
    ])

    expect(repository.manager.transaction).toHaveBeenCalledTimes(1)
    expect(repository.update).toHaveBeenNthCalledWith(
      1,
      SysParamsEntity,
      { key: 'first' },
      { value: 'one' },
    )
    expect(repository.update).toHaveBeenNthCalledWith(
      2,
      SysParamsEntity,
      { key: 'second' },
      { value: 'two' },
    )
  })
})
