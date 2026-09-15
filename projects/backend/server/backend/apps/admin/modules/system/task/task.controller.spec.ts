import { PATH_METADATA } from '@nestjs/common/constants'

jest.mock('@/common/decorators', () => ({
  definePermission: jest.fn((prefix: string, actions: string[]) =>
    actions.reduce<Record<string, string>>((permissions, action) => {
      permissions[action.toUpperCase()] = `${prefix}:${action}`
      return permissions
    }, {}),
  ),
  Permission: jest.fn(() => () => undefined),
}))

jest.mock('./dto', () => ({
  TaskCreateDto: class MockTaskCreateDto {},
  TaskFilterDto: class MockTaskFilterDto {},
  TaskUpdateDto: class MockTaskUpdateDto {},
}))

jest.mock('./task.service', () => ({
  TaskService: class MockTaskService {},
}))

import { TaskController } from './task.controller'

describe('TaskController', () => {
  it('uses a SystemModule-relative route prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, TaskController)).toBe('tasks')
  })

  it('updates a task without requiring a service payload', async () => {
    const taskService = {
      checkServiceMeta: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new TaskController(taskService as any)

    await controller.update('task-1', { status: 1 } as any)

    expect(taskService.checkServiceMeta).not.toHaveBeenCalled()
    expect(taskService.update).toHaveBeenCalledWith('task-1', { status: 1 })
  })

  it('validates and forwards edited service settings for any task', async () => {
    const taskService = {
      checkServiceMeta: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
    }
    const controller = new TaskController(taskService as any)
    const dto = {
      service: 'OtherJob.handle',
      data: '{"retentionDays":30}',
    }

    await controller.update('system-task-1', dto as any)

    expect(taskService.checkServiceMeta).toHaveBeenCalledWith('OtherJob', 'handle')
    expect(taskService.update).toHaveBeenCalledWith('system-task-1', dto)
  })
})
