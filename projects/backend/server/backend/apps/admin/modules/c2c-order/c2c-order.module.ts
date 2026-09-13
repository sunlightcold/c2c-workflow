import {
  MerchantEntity,
  MerchantOrderEntity,
  MerchantOrderStatusHistoryEntity,
  MerchantOrderSyncCheckpointEntity,
  PaymentOrderEntity,
  PaymentOrderStatusHistoryEntity,
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
import { C2cOrderAppealService, C2C_ORDER_APPEAL_STORE } from './c2c-order-appeal.service'
import { TypeOrmC2cOrderAppealStore } from './typeorm-c2c-order-appeal.store'

@Module({
  imports: [
    BusinessModule,
    C2cPlatformModule,
    TypeOrmModule.forFeature([
      MerchantEntity,
      MerchantOrderEntity,
      MerchantOrderStatusHistoryEntity,
      MerchantOrderSyncCheckpointEntity,
      PaymentOrderEntity,
      PaymentOrderStatusHistoryEntity,
    ]),
  ],
  controllers: [C2cOrderController],
  providers: [
    EnvironmentC2cSecretResolver,
    { provide: C2C_SECRET_RESOLVER, useExisting: EnvironmentC2cSecretResolver },
    TypeOrmC2cOrderSyncStore,
    { provide: C2C_ORDER_SYNC_STORE, useExisting: TypeOrmC2cOrderSyncStore },
    C2cOrderSyncService,
    TypeOrmC2cOrderAppealStore,
    { provide: C2C_ORDER_APPEAL_STORE, useExisting: TypeOrmC2cOrderAppealStore },
    C2cOrderAppealService,
    C2cOrderService,
  ],
  exports: [
    C2C_ORDER_SYNC_STORE,
    C2C_SECRET_RESOLVER,
    C2cOrderAppealService,
    C2cOrderSyncService,
    C2cOrderService,
  ],
})
export class C2cOrderModule {}
