import type { SysParamsTypeEnum } from '@/apps/admin/database'

export interface SystemParamDefinition {
  key: string
  name: string
  value: string
  type: SysParamsTypeEnum
  description?: string
}
