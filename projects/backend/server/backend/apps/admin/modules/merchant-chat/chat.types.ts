import { HttpException } from '@nestjs/common'
import type { MerchantOrderEntity, PaymentOrderStatus } from '@admin/database'

export const CHAT_TTL_MS = 2 * 60 * 60 * 1000
export const CHAT_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export type ChatSendStatus = 'SENDING' | 'SENT' | 'FAILED' | 'UNKNOWN'
export type ChatConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISABLED'
  | 'PENDING'
  | 'ERROR'
export interface ChatScope {
  tenantId: string
  merchantId: string
}
export interface ChatCapabilities {
  receiveText: 'SUPPORTED' | 'PENDING'
  sendText: 'SUPPORTED' | 'PENDING'
  receiveImage: 'SUPPORTED' | 'PENDING'
  sendImage: 'SUPPORTED' | 'PENDING'
}
export interface ChatMerchant extends ChatScope {
  name: string
  platform: 'BINANCE' | 'OKX'
  status: ChatConnectionStatus
  reasonCode?: string
  capabilities: ChatCapabilities
}
export type ChatOrderContext = Pick<
  MerchantOrderEntity,
  | 'id'
  | 'platformOrderId'
  | 'counterpartyName'
  | 'fiatAmount'
  | 'fiatCurrency'
  | 'asset'
  | 'assetAmount'
  | 'unitPrice'
  | 'status'
  | 'paymentMethod'
  | 'platformCreatedAt'
  | 'paymentDeadline'
> & { paymentStatus: PaymentOrderStatus | null }
export interface ChatOrderSummary {
  fiatAmount: string
  fiatCurrency: string
  asset: string
  assetAmount: string
  unitPrice: string | null
  status: string
  paymentStatus: PaymentOrderStatus | null
  paymentMethod: string | null
  platformCreatedAt: string
  paymentDeadline: string | null
}
export interface ChatConversation extends ChatScope {
  id: string
  merchantOrderId: string
  platformOrderId: string
  buyerName: string
  updatedAt: string
  canReply: boolean
  order: ChatOrderSummary
}
export interface ChatMessage {
  id: string
  conversationId: string
  sourceMessageId?: string
  requestId?: string
  type: 'TEXT' | 'IMAGE'
  origin: 'BUYER' | 'SELF' | 'PLATFORM_AUTO'
  text?: string
  attachmentId?: string
  occurredAt: string
  receivedAt: string
  status?: ChatSendStatus
  reasonCode?: string
}
export interface ChatOrderOption {
  id: string
  merchantId: string
  merchantName: string
  platformOrderId: string
  counterpartyName: string | null
  status: string
  fiatAmount: string
  fiatCurrency: string
  platformCreatedAt: Date
}
export interface ChatInbound {
  orderNo: string
  sourceMessageId: string
  uuid?: string
  buyerName: string
  type: 'TEXT' | 'IMAGE'
  origin: ChatMessage['origin']
  text?: string
  imageUrl?: string
  occurredAt?: string
}
export interface ChatSnapshot {
  instanceId: string
  sequence: number
  retentionSeconds: number
  merchants: ChatMerchant[]
  conversations: ChatConversation[]
  messages: ChatMessage[]
}
export interface ChatEvent extends ChatScope {
  instanceId: string
  sequence: number
  type: 'message' | 'merchant' | 'expired' | 'conversation'
  conversation?: ChatConversation
  message?: ChatMessage
  merchant?: ChatMerchant
  conversationId?: string
}
export class ChatError extends HttpException {
  constructor(
    public readonly reasonCode: string,
    message: string,
    status = 409,
  ) {
    super({ message, data: { reasonCode } }, status)
  }
}
