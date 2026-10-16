import { requestClient } from '#/api/request';

export namespace MerchantChatApi {
  export type SendStatus = 'FAILED' | 'SENDING' | 'SENT' | 'UNKNOWN';
  export interface Scope {
    tenantId: string;
    merchantId?: string;
  }
  export interface Merchant {
    tenantId: string;
    merchantId: string;
    name: string;
    platform: 'BINANCE' | 'OKX';
    status:
      | 'CONNECTED'
      | 'CONNECTING'
      | 'DISABLED'
      | 'ERROR'
      | 'PENDING'
      | 'RECONNECTING';
    reasonCode?: string;
    capabilities: Record<
      'receiveImage' | 'receiveText' | 'sendImage' | 'sendText',
      'PENDING' | 'SUPPORTED'
    >;
  }
  export interface Conversation {
    id: string;
    tenantId: string;
    merchantId: string;
    merchantOrderId: string;
    platformOrderId: string;
    buyerName: string;
    updatedAt: string;
    canReply: boolean;
  }
  export interface Message {
    id: string;
    conversationId: string;
    sourceMessageId?: string;
    requestId?: string;
    type: 'IMAGE' | 'TEXT';
    origin: 'BUYER' | 'PLATFORM_AUTO' | 'SELF';
    text?: string;
    attachmentId?: string;
    occurredAt: string;
    receivedAt: string;
    status?: SendStatus;
    reasonCode?: string;
  }
  export interface Snapshot {
    instanceId: string;
    sequence: number;
    retentionSeconds: number;
    merchants: Merchant[];
    conversations: Conversation[];
    messages: Message[];
  }
  export interface Event {
    instanceId: string;
    sequence: number;
    type: 'expired' | 'merchant' | 'message';
    tenantId: string;
    merchantId: string;
    conversation?: Conversation;
    conversationId?: string;
    message?: Message;
    merchant?: Merchant;
  }
  export interface Reply {
    instanceId: string;
    requestId: string;
    messages: Array<Pick<Message, 'id' | 'reasonCode' | 'status' | 'type'>>;
  }
}
export function getMerchantChatApi(params: MerchantChatApi.Scope) {
  return requestClient.get<MerchantChatApi.Snapshot>(
    '/sys/merchant-chats/live',
    { params },
  );
}
export function replyMerchantChatApi(
  scope: MerchantChatApi.Scope,
  data: {
    conversationId: string;
    image?: File;
    instanceId: string;
    requestId: string;
    text?: string;
  },
) {
  const form = new FormData();
  form.append('tenantId', scope.tenantId);
  form.append('merchantId', scope.merchantId ?? '');
  form.append('conversationId', data.conversationId);
  form.append('instanceId', data.instanceId);
  form.append('requestId', data.requestId);
  if (data.text) form.append('text', data.text);
  if (data.image) form.append('image', data.image);
  return requestClient.post<MerchantChatApi.Reply>(
    '/sys/merchant-chats/live/reply',
    form,
    { timeout: 60_000 },
  );
}
export function getMerchantChatImageApi(
  scope: MerchantChatApi.Scope,
  instanceId: string,
  message: MerchantChatApi.Message,
) {
  return requestClient.get<Blob>(
    `/sys/merchant-chats/live/messages/${message.id}/attachments/${message.attachmentId}`,
    {
      params: { ...scope, instanceId },
      responseType: 'blob',
      responseReturn: 'body',
    },
  );
}
