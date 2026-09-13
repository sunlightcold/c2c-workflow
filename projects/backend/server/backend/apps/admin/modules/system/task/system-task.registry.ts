import { SysTaskSource, SysTaskStatus, SysTaskTypeEnum } from '@/apps/admin/database'
import { CLIENT_ERROR_RETENTION_DAYS } from '../../client-error/client-error.constants'

export const EXPIRED_ADMIN_TOKEN_CLEANUP_CRON = '0 0 */12 * * *'
export const CLIENT_ERROR_CLEANUP_CRON = '0 15 3 * * *'
export const C2C_ORDER_DISCOVERY_INTERVAL_MS = 5_000

export interface SystemTaskDefinition {
  id: string
  name: string
  service: string
  type: SysTaskTypeEnum
  status: SysTaskStatus
  cron?: string
  every?: number
  data?: string
  description?: string
}

export const SYSTEM_TASKS: SystemTaskDefinition[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    name: '清理过期Token',
    service: 'SystemMaintenanceJob.clearExpiredAdminTokenSessions',
    type: SysTaskTypeEnum.Cron,
    status: SysTaskStatus.Activated,
    cron: EXPIRED_ADMIN_TOKEN_CLEANUP_CRON,
    description: '清理已过期的后台登录Token会话记录',
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    name: '清理过期客户端错误',
    service: 'SystemMaintenanceJob.clearExpiredClientErrors',
    type: SysTaskTypeEnum.Cron,
    status: SysTaskStatus.Activated,
    cron: CLIENT_ERROR_CLEANUP_CRON,
    description: `清理超过 ${CLIENT_ERROR_RETENTION_DAYS} 天的客户端错误事件`,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    name: '自动发现商家订单',
    service: 'C2cAutomationJob.syncDueOrders',
    type: SysTaskTypeEnum.Interval,
    status: SysTaskStatus.Activated,
    every: C2C_ORDER_DISCOVERY_INTERVAL_MS,
    description: '领取到期商家账号并同步币安或欧易买币订单',
  },
]

export const SYSTEM_TASK_SOURCE = SysTaskSource.System
export const SYSTEM_TASK_SERVICES = new Set(SYSTEM_TASKS.map((task) => task.service.split('.')[0]))
