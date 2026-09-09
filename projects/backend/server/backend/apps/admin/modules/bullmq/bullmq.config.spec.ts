jest.mock('@/common/utils', () => ({
  getConfig: jest.fn((key: string) => {
    if (key === 'admin') {
      return {
        sysPrefix: 'tpl',
        redis: {
          url: 'redis://localhost:6379',
        },
      }
    }
    return {}
  }),
}))

import { createBullMqRootOptions } from './bullmq.config'

describe('createBullMqRootOptions', () => {
  it('creates a shared BullMQ root configuration', () => {
    expect(createBullMqRootOptions()).toEqual({
      connection: {
        url: 'redis://localhost:6379',
      },
      prefix: 'tpl',
    })
  })
})
