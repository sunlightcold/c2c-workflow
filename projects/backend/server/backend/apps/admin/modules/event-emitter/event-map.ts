/**
 * 全局事件 Key 常量字典。只有在此处注册并绑定载荷类型的事件才能发送。
 */
export const EVENT_KEYS = {
  ADMIN_SESSION_REVOKED: 'admin.session.revoked',
} as const

export interface AdminSessionRevokedPayload {
  token: string
  userId?: number
}

export interface GlobalEventMap {
  [EVENT_KEYS.ADMIN_SESSION_REVOKED]: AdminSessionRevokedPayload
}

export type EventNames = keyof GlobalEventMap
