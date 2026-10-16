import { parseLargeIdJson } from '@/common/utils/json-large-id'
import { ChatError, type ChatInbound } from './chat.types'

export const parseChatJson = parseLargeIdJson
export function chatRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
function text(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  return ''
}
export function unwrapChatItems(value: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 4) throw new ChatError('CHAT_PROTOCOL_INVALID', '平台聊天消息格式无效')
  if (Array.isArray(value)) return value.flatMap((item) => unwrapChatItems(item, depth + 1))
  const item = chatRecord(value)
  if (item.data !== undefined) return unwrapChatItems(item.data, depth + 1)
  if (item.message && typeof item.message === 'object')
    return unwrapChatItems(item.message, depth + 1)
  return [item]
}
export function normalizeChatMessage(
  item: Record<string, unknown>,
  orderNo?: string,
): ChatInbound | null {
  const type = text(item.type ?? item.chatMessageType).toLowerCase()
  if (!['text', 'image', 'auto_reply'].includes(type)) return null
  const sourceMessageId = text(item.id ?? item.messageId)
  const uuid = text(item.uuid)
  const self = item.self === true || item.self === 'true'
  if (!sourceMessageId && !(self && uuid))
    throw new ChatError('CHAT_PROTOCOL_INVALID', '平台聊天消息缺少可靠标识')
  const sourceOrder = text(item.orderNo) || orderNo || ''
  if (!sourceOrder) throw new ChatError('CHAT_PROTOCOL_INVALID', '平台聊天消息缺少订单号')
  const occurredAt = messageTime(item.createTime ?? item.createdAt)
  const content = text(item.content)
  const buyerName = messageBuyer(item)
  const imageUrl = text(item.imageUrl)
  validateLengths([
    [sourceMessageId, 128],
    [sourceOrder, 128],
    [uuid, 128],
    [buyerName, 256],
    [imageUrl, 8192],
  ])
  return {
    orderNo: sourceOrder,
    sourceMessageId,
    ...(uuid ? { uuid } : {}),
    buyerName,
    type: type === 'image' ? 'IMAGE' : 'TEXT',
    origin: self ? 'SELF' : type === 'auto_reply' ? 'PLATFORM_AUTO' : 'BUYER',
    ...(content ? { text: content.slice(0, 4000) } : {}),
    ...(type === 'image' ? { imageUrl } : {}),
    occurredAt,
  }
}
function messageBuyer(item: Record<string, unknown>) {
  return (
    text(
      item.fromNickname ?? item.fromNickName ?? item.nickName ?? item.senderNickName ?? item.sender,
    ) || '买家'
  )
}
function messageTime(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  const time = new Date(typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
  return Number.isFinite(time.getTime()) ? time.toISOString() : undefined
}
function validateLengths(fields: Array<[string, number]>) {
  if (fields.some(([value, limit]) => value.length > limit))
    throw new ChatError('CHAT_PROTOCOL_INVALID', '平台聊天字段超出支持范围')
}
