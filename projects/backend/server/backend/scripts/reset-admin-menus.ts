import * as path from 'path'

process.env.NODE_CONFIG_DIR = path.join(__dirname, '../config')

import '../apps/admin/bootstrap/timezone.bootstrap'

import { getConfig } from '@/common/utils'
import { DataSource } from 'typeorm'
import {
  SysMenuEntity,
  SysRoleEntity,
  SysUserEntity,
  SysLogEntity,
  SysAccessTokenEntity,
  SysOnlineUserEntity,
  SysTaskEntity,
  SysTaskLogEntity,
  SysParamsEntity,
  SysStaticFileEntity,
  SysUserFileEntity,
} from '../apps/admin/database'
import { MenuRegistryService } from '../apps/admin/modules/system/menu/menu-registry.service'

async function bootstrap() {
  const pgConfig = getConfig('admin').postgres
  const dbTimeZone = getConfig('common').dbTimeZone
  const dataSource = new DataSource({
    type: 'postgres',
    host: pgConfig.host,
    port: pgConfig.port,
    username: pgConfig.username,
    password: pgConfig.password,
    database: pgConfig.database,
    synchronize: pgConfig.synchronize,
    logging: pgConfig.logging,
    extra: {
      options: `-c timezone=${dbTimeZone}`,
    },
    entities: [
      SysMenuEntity,
      SysRoleEntity,
      SysUserEntity,
      SysLogEntity,
      SysAccessTokenEntity,
      SysOnlineUserEntity,
      SysTaskEntity,
      SysTaskLogEntity,
      SysParamsEntity,
      SysStaticFileEntity,
      SysUserFileEntity,
    ],
  })

  try {
    await dataSource.initialize()
    console.log('[reset-admin-menus] database connected')

    const menuRegistryService = new MenuRegistryService(
      dataSource,
      dataSource.getRepository(SysMenuEntity),
    )
    await menuRegistryService.resetAndSyncDefaultMenus()
    console.log('[reset-admin-menus] default admin menus have been reset')
  } catch (error) {
    console.error('[reset-admin-menus] failed')
    console.error(error)
    process.exitCode = 1
  } finally {
    if (dataSource.isInitialized) {
      await dataSource.destroy()
    }
  }
}

bootstrap()
