/// <reference types="jest" />

jest.mock('nestjs-typeorm-paginate', () => ({
  paginate: jest.fn().mockResolvedValue({ items: [], meta: {} }),
}))

import { TaskLogService } from './task-log.service'

describe('TaskLogService', () => {
  it('returns the newest task executions first with stable pagination', async () => {
    const queryBuilder = {
      andWhere: jest.fn(),
      loadRelationIdAndMap: jest.fn(),
      orderBy: jest.fn(),
      addOrderBy: jest.fn(),
    }
    queryBuilder.andWhere.mockReturnValue(queryBuilder)
    queryBuilder.loadRelationIdAndMap.mockReturnValue(queryBuilder)
    queryBuilder.orderBy.mockReturnValue(queryBuilder)
    queryBuilder.addOrderBy.mockReturnValue(queryBuilder)

    const repository = {
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    }
    const service = new TaskLogService()
    Object.defineProperty(service, 'taskLogRepository', { value: repository })

    await service.filter({ pageIndex: 1, pageSize: 20 })

    expect(queryBuilder.orderBy).toHaveBeenCalledWith('taskLog.startedAt', 'DESC')
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith('taskLog.id', 'DESC')
  })
})
