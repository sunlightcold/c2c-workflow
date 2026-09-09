import type { SysMenuType } from '@/apps/admin/database'
import type { StatusEnum } from '@/common/interfaces'

export interface AdminMenuDefinition {
  key: string
  type: SysMenuType
  name: string
  parentKey?: string
  path?: string
  component?: string
  permission?: string
  icon?: string
  iframeSrc?: string
  orderNo?: number
  status?: StatusEnum
  keepAlive?: StatusEnum
  show?: StatusEnum
}
