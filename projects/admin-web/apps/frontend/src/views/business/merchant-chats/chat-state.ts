import type { MerchantChatApi } from '#/api';

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
  if (event.type === 'message' && event.conversation && event.message) {
    const index = snapshot.conversations.findIndex(
      (c) => c.id === event.conversation?.id,
    );
    if (index === -1) snapshot.conversations.push(event.conversation);
    else snapshot.conversations[index] = event.conversation;
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
export const chatConnectionText: Record<
  MerchantChatApi.Merchant['status'],
  string
> = {
  CONNECTED: '已连接',
  CONNECTING: '连接中',
  DISABLED: '已停用',
  ERROR: '连接异常',
  PENDING: '待接入',
  RECONNECTING: '重连中',
};
export const chatSendText: Record<MerchantChatApi.SendStatus, string> = {
  FAILED: '发送失败',
  SENDING: '发送中',
  SENT: '平台已回显',
  UNKNOWN: '结果未知，请到交易平台核实',
};
