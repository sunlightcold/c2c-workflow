import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { getAdminPostgresOptions } from './admin-postgres-options'
import {
  SysAccessTokenEntity,
  SysLogEntity,
  SysMenuEntity,
  SysOnlineUserEntity,
  SysParamsEntity,
  SysRoleEntity,
  SysStaticFileEntity,
  SysStorageBindingEntity,
  SysStorageChannelEntity,
  SysTaskEntity,
  SysTaskLogEntity,
  SysUserEntity,
  SysUserFileEntity,
  TutorialEntity,
  SysAiChannelEntity,
  SysAiFeatureRouteEntity,
  SysAiModelEntity,
  SysAiCallLogEntity,
  SysClientErrorEventEntity,
} from './system'
import {
  MerchantEntity,
  MerchantPaymentPlanEntity,
  PaymentAccountChannelEntity,
  PaymentAccountEntity,
  PaymentChannelEntity,
  PaymentPlatformEntity,
  TenantEntity,
  PaymentOrderEntity,
  PaymentAttemptEntity,
  PaymentOrderStatusHistoryEntity,
} from './business'

const sysEntities = [
  SysUserEntity,
  SysRoleEntity,
  SysMenuEntity,
  SysLogEntity,
  SysAccessTokenEntity,
  SysOnlineUserEntity,
  SysTaskEntity,
  SysTaskLogEntity,
  SysParamsEntity,
  SysStaticFileEntity,
  SysUserFileEntity,
  SysStorageChannelEntity,
  SysStorageBindingEntity,
  TutorialEntity,
  SysAiChannelEntity,
  SysAiFeatureRouteEntity,
  SysAiModelEntity,
  SysAiCallLogEntity,
  SysClientErrorEventEntity,
]

const entities = [
  ...sysEntities,
  TenantEntity,
  MerchantEntity,
  PaymentPlatformEntity,
  PaymentChannelEntity,
  PaymentAccountEntity,
  PaymentAccountChannelEntity,
  MerchantPaymentPlanEntity,
  PaymentOrderEntity,
  PaymentAttemptEntity,
  PaymentOrderStatusHistoryEntity,
]

/**
 * 数据base 全局模块
 * @export
 * @class DatabaseModule
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature(entities),
    TypeOrmModule.forRoot({
      ...getAdminPostgresOptions(),
      autoLoadEntities: true,
    }),
  ],
  providers: [],
  exports: [TypeOrmModule],
})
export class DatabaseModule {}
