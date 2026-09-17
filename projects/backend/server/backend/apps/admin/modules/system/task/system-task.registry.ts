import { SysTaskSource, SysTaskStatus, SysTaskTypeEnum } from '@/apps/admin/database'

export const EXPIRED_ADMIN_TOKEN_CLEANUP_CRON = '0 0 */12 * * *'
export const TASK_LOG_CLEANUP_CRON = '0 0 4 * * *'
export const C2C_ORDER_DISCOVERY_INTERVAL_MS = 5_000
export const C2C_AUTOMATIC_PAYMENT_INTERVAL_MS = 5_000
export const C2C_PAYMENT_RECOVERY_INTERVAL_MS = 15_000
export const C2C_AUTO_APPEAL_INTERVAL_MS = 30_000
export const C2C_COMPLETION_REPLY_INTERVAL_MS = 30_000

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
    id: '00000000-0000-4000-8000-000000000107',
    name: '清理过期任务日志',
    service: 'LogClearJob.clearTaskLog',
    type: SysTaskTypeEnum.Cron,
    status: SysTaskStatus.Activated,
    cron: TASK_LOG_CLEANUP_CRON,
    description: '每天凌晨4点删除执行时间早于2天前的任务日志',
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
  {
    id: '00000000-0000-4000-8000-000000000105',
    name: '自动执行商家订单支付',
    service: 'C2cAutomationJob.processAutomaticPayments',
    type: SysTaskTypeEnum.Interval,
    status: SysTaskStatus.Activated,
    every: C2C_AUTOMATIC_PAYMENT_INTERVAL_MS,
    description: '为符合条件的商家订单创建并提交支付宝支付',
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    name: '自动回查支付结果',
    service: 'C2cAutomationJob.recoverPayments',
    type: SysTaskTypeEnum.Interval,
    status: SysTaskStatus.Activated,
    every: C2C_PAYMENT_RECOVERY_INTERVAL_MS,
    description: '回查处理中支付并补偿币安或欧易付款标记',
  },
  {
    id: '00000000-0000-4000-8000-000000000108',
    name: 'C2C付款超时自动申诉',
    service: 'C2cAutomationJob.processAutomaticAppeals',
    type: SysTaskTypeEnum.Interval,
    status: SysTaskStatus.Activated,
    every: C2C_AUTO_APPEAL_INTERVAL_MS,
    description: '每30秒检查超过商家配置等待时间且平台仍为已付款待放行状态的买单并自动申诉',
  },
  {
    id: '00000000-0000-4000-8000-000000000109',
    name: 'C2C订单完成自动回复',
    service: 'C2cAutomationJob.processCompletionReplies',
    type: SysTaskTypeEnum.Interval,
    status: SysTaskStatus.Activated,
    every: C2C_COMPLETION_REPLY_INTERVAL_MS,
    description: '每30秒查询启用后的币安买单，完成后发送一次平台聊天回复并重试发送失败项',
  },
]

export const SYSTEM_TASK_SOURCE = SysTaskSource.System
export const SYSTEM_TASK_SERVICES = new Set(SYSTEM_TASKS.map((task) => task.service.split('.')[0]))
