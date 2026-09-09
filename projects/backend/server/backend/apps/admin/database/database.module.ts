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

const entities = [...sysEntities]

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
