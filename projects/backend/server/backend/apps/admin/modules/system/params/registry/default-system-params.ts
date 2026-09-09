import { SysParamsTypeEnum } from '@/apps/admin/database'
import { SystemParamsKey } from '@/common/constants'
import { getConfig } from '@/common/utils'
import type { SystemParamDefinition } from './system-param.types'

const adminConfig = getConfig('admin')

export const DEFAULT_SYSTEM_PARAMS: SystemParamDefinition[] = [
  {
    key: SystemParamsKey.StaticServerUrl,
    name: '系统静态文件地址',
    value: adminConfig.staticServerUrl ?? '',
    type: SysParamsTypeEnum.System,
    description: '本地静态资源服务的公开访问域名，用于拼接上传文件访问 URL',
  },
]
