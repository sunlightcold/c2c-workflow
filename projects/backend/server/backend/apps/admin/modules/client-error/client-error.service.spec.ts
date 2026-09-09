/// <reference types="jest" />

jest.mock('@/apps/admin/database', () => ({
  SysClientErrorEventEntity: class SysClientErrorEventEntity {},
}))

import type { SysClientErrorEventEntity } from '@/apps/admin/database'
import type { Repository } from 'typeorm'
import { ClientErrorService } from './client-error.service'

describe('ClientErrorService', () => {
  it('applies retention to the server-controlled creation time', async () => {
    const repository = {
      delete: jest.fn().mockResolvedValue({ affected: 3 }),
    } as unknown as Repository<SysClientErrorEventEntity>
    const service = new ClientErrorService(repository)
    const cutoff = new Date('2026-07-05T00:00:00.000Z')

    await expect(service.deleteCreatedBefore(cutoff)).resolves.toBe(3)
    expect(repository.delete).toHaveBeenCalledWith({
      createdAt: expect.objectContaining({ _type: 'lessThan', _value: cutoff }),
    })
  })
})
