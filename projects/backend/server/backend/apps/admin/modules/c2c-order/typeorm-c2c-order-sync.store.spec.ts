import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { TypeOrmC2cOrderSyncStore } from './typeorm-c2c-order-sync.store'

describe('TypeOrmC2cOrderSyncStore dependency metadata', () => {
  it('uses DataSource as its Nest injection token', () => {
    expect(Reflect.getMetadata('self:paramtypes', TypeOrmC2cOrderSyncStore)).toEqual([
      { index: 0, param: DataSource },
    ])
  })
})
