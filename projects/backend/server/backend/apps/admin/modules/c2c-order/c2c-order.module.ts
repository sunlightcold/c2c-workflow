import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
} from '@admin/database'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { BusinessModule } from '../business'
import { C2cPlatformModule } from '../c2c-platform'
import { C2cOrderSyncService, C2C_ORDER_SYNC_STORE } from './c2c-order-sync.service'
import { C2C_SECRET_RESOLVER, EnvironmentC2cSecretResolver } from './c2c-secret-resolver'
import { TypeOrmC2cOrderSyncStore } from './typeorm-c2c-order-sync.store'
import { C2cOrderController } from './c2c-order.controller'
import { C2cOrderService } from './c2c-order.service'

@Module({
  imports: [
    BusinessModule,
    C2cPlatformModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      MerchantOrderEntity,
      MerchantOrderStatusHistoryEntity,
      MerchantOrderSyncCheckpointEntity,
    ]),
  ],
  controllers: [C2cOrderController],
  providers: [
    EnvironmentC2cSecretResolver,
    { provide: C2C_SECRET_RESOLVER, useExisting: EnvironmentC2cSecretResolver },
    TypeOrmC2cOrderSyncStore,
    { provide: C2C_ORDER_SYNC_STORE, useExisting: TypeOrmC2cOrderSyncStore },
    C2cOrderSyncService,
    C2cOrderService,
  ],
  exports: [C2cOrderSyncService, C2cOrderService],
})
export class C2cOrderModule {}
