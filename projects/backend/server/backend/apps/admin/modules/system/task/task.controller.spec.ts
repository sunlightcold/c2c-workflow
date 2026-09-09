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
})
