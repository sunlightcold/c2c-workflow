import 'reflect-metadata'
import {
  MerchantOrderEntity,
  MerchantOrderStatus,
  MerchantOrderStatusHistoryEntity,
  MerchantPlatform,
  MerchantOrderSyncCheckpointEntity,
} from '@admin/database'
import { DataSource } from 'typeorm'
import { C2cBuyOrderStatus } from '../c2c-platform'
import { TypeOrmC2cOrderSyncStore } from './typeorm-c2c-order-sync.store'

describe('TypeOrmC2cOrderSyncStore', () => {
  it('uses DataSource as its Nest injection token', () => {
    expect(Reflect.getMetadata('self:paramtypes', TypeOrmC2cOrderSyncStore)).toEqual([
      { index: 0, param: DataSource },
    ])
  })

  it('records an observed terminal platform status using the funds-exposed transition rules', async () => {
    const order = {
      id: 'order-1',
      tenantId: 'tenant-1',
      merchantId: 'merchant-1',
      status: MerchantOrderStatus.PENDING_RELEASE,
      platformStatus: C2cBuyOrderStatus.PAID,
      platformUpdatedAt: null,
      lastSyncedAt: new Date('2026-09-16T07:00:00.000Z'),
      lastError: null,
    }
    const orderRepository = {
      findOne: jest.fn().mockResolvedValue(order),
      save: jest.fn(async (value) => value),
    }
    const historyRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
    }
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === MerchantOrderEntity ? orderRepository : historyRepository,
      ),
    }
    const dataSource = {
      transaction: jest.fn((work) => work(manager)),
    }
    const store = new TypeOrmC2cOrderSyncStore(dataSource as never)
    const observedAt = new Date('2026-09-16T08:00:00.000Z')

    await expect(
      store.updateObservedStatus({
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        merchantOrderId: 'order-1',
        platformStatus: C2cBuyOrderStatus.CANCELLED,
        observedAt,
      }),
    ).resolves.toBe(MerchantOrderStatus.FUNDS_EXCEPTION)

    expect(orderRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: MerchantOrderStatus.FUNDS_EXCEPTION,
        platformStatus: C2cBuyOrderStatus.CANCELLED,
        platformUpdatedAt: observedAt,
        lastSyncedAt: observedAt,
      }),
    )
    expect(manager.getRepository).toHaveBeenCalledWith(MerchantOrderStatusHistoryEntity)
    expect(historyRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: MerchantOrderStatus.PENDING_RELEASE,
        toStatus: MerchantOrderStatus.FUNDS_EXCEPTION,
        source: 'COMPLETION_REPLY_SCAN',
      }),
    )
  })

  it('lets the scheduler interval control the next successful sync', async () => {
    const checkpoint = {
      create: jest.fn((value) => value),
      findOne: jest.fn().mockResolvedValue({ id: 'checkpoint-1' }),
      save: jest.fn(async (value) => value),
    }
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === MerchantOrderSyncCheckpointEntity) return checkpoint
        throw new Error(`Unexpected repository: ${String(entity)}`)
      }),
      query: jest.fn().mockResolvedValue(undefined),
    }
    const dataSource = {
      transaction: jest.fn((work) => work(manager)),
    }
    const store = new TypeOrmC2cOrderSyncStore(dataSource as never)
    const completedAt = new Date('2026-09-26T07:00:00.000Z')

    await store.persistWindow(
      {
        tenantId: 'tenant-1',
        merchantId: 'merchant-1',
        platform: MerchantPlatform.BINANCE,
      },
      [],
      completedAt,
    )

    expect(checkpoint.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lastSuccessAt: completedAt,
        nextSyncAt: completedAt,
      }),
    )
  })
})
