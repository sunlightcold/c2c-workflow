import type { MerchantChatApi } from '#/api';

import { businessEnumText } from '../shared/business-ui';

export function chatPaymentStatusText(status: null | string | undefined) {
  if (status === undefined) return '未提供';
  return status === null ? '未创建' : businessEnumText(status);
}

export function formatChatDecimal(value: string) {
  return value.includes('.')
    ? value.replace(/0+$/, '').replace(/\.$/, '')
    : value;
}

export function chatConversationItems(
  snapshot: MerchantChatApi.Snapshot,
  search: string,
) {
  const merchants = new Map(
    snapshot.merchants.map((merchant) => [merchant.merchantId, merchant]),
  );
  const latest = new Map<string, MerchantChatApi.Message>();
  for (const message of snapshot.messages) {
    const previous = latest.get(message.conversationId);
    if (!previous || previous.receivedAt <= message.receivedAt)
      latest.set(message.conversationId, message);
  }
  const query = search.trim().toLocaleLowerCase();
  return snapshot.conversations
    .map((conversation) => {
      const message = latest.get(conversation.id);
      const merchantName =
        merchants.get(conversation.merchantId)?.name ?? '商家';
      const content = message?.type === 'IMAGE' ? '[图片]' : message?.text;
      return {
        ...conversation,
        merchantName,
        preview: content
          ? `${message?.origin === 'SELF' ? '商家：' : ''}${content}`
          : '暂无消息',
      };
    })
    .filter(
      (conversation) =>
        !query ||
        [
          conversation.buyerName,
          conversation.platformOrderId,
          conversation.merchantName,
        ].some((value) => value.toLocaleLowerCase().includes(query)),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function applyChatEvent(
  snapshot: MerchantChatApi.Snapshot,
  event: MerchantChatApi.Event,
): boolean {
  if (event.instanceId !== snapshot.instanceId) return false;
  if (event.sequence <= snapshot.sequence) return true;
  snapshot.sequence = event.sequence;
  if (event.type === 'merchant' && event.merchant) {
    const index = snapshot.merchants.findIndex(
      (m) => m.merchantId === event.merchantId,
    );
    if (index === -1) snapshot.merchants.push(event.merchant);
    else snapshot.merchants[index] = event.merchant;
  }
  if (
    (event.type === 'message' || event.type === 'conversation') &&
    event.conversation
  ) {
    const index = snapshot.conversations.findIndex(
      (c) => c.id === event.conversation?.id,
    );
    if (index === -1) snapshot.conversations.push(event.conversation);
    else snapshot.conversations[index] = event.conversation;
  }
  if (event.type === 'message' && event.conversation && event.message) {
    const messageIndex = snapshot.messages.findIndex(
      (m) => m.id === event.message?.id,
    );
    if (messageIndex === -1) snapshot.messages.push(event.message);
    else snapshot.messages[messageIndex] = event.message;
    const messages = snapshot.messages.filter(
      (m) => m.conversationId === event.conversation?.id,
    );
    if (messages.length > 200) {
      const removed = new Set(messages.slice(0, -200).map((m) => m.id));
      snapshot.messages = snapshot.messages.filter((m) => !removed.has(m.id));
    }
    if (snapshot.messages.length > 10_000)
      snapshot.messages.splice(0, snapshot.messages.length - 10_000);
  }
  if (event.type === 'expired') {
    snapshot.conversations = snapshot.conversations.filter(
      (c) => c.id !== event.conversationId,
    );
    snapshot.messages = snapshot.messages.filter(
      (m) => m.conversationId !== event.conversationId,
    );
  }
  return true;
}
export const chatSendText: Record<MerchantChatApi.SendStatus, string> = {
  FAILED: '发送失败',
  SENDING: '发送中',
  SENT: '平台已回显',
  UNKNOWN: '结果未知，请到交易平台核实',
};
