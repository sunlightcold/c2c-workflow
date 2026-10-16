import type { MerchantChatApi } from '#/api';

import { describe, expect, it } from 'vitest';

import { applyChatEvent } from './chat-state';

describe('chat live state', () => {
  const snapshot = (): MerchantChatApi.Snapshot => ({
    instanceId: 'runtime',
    sequence: 0,
    retentionSeconds: 7200,
    merchants: [],
    conversations: [],
    messages: [],
  });
  const event = (
    sequence: number,
    status: MerchantChatApi.SendStatus = 'SENDING',
  ): MerchantChatApi.Event => ({
    instanceId: 'runtime',
    sequence,
    tenantId: 'tenant',
    merchantId: 'merchant',
    type: 'message',
    conversation: {
      id: 'conversation',
      tenantId: 'tenant',
      merchantId: 'merchant',
      merchantOrderId: 'local-order',
      platformOrderId: '20476365073825144832',
      buyerName: 'Buyer',
      updatedAt: new Date().toISOString(),
      canReply: true,
    },
    message: {
      id: 'message',
      conversationId: 'conversation',
      type: 'TEXT',
      origin: 'SELF',
      text: 'reply',
      occurredAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      status,
    },
  });
  it('merges sending state updates, ignores duplicates and rejects a different runtime', () => {
    const state = snapshot();
    expect(applyChatEvent(state, event(1))).toBe(true);
    applyChatEvent(state, event(2, 'UNKNOWN'));
    applyChatEvent(state, event(1, 'SENT'));
    expect(state.messages).toHaveLength(1);
    expect(state.messages[0]?.status).toBe('UNKNOWN');
    expect(applyChatEvent(state, { ...event(3), instanceId: 'other' })).toBe(
      false,
    );
    expect(state.sequence).toBe(2);
  });
  it('removes expired conversations and their messages', () => {
    const state = snapshot();
    applyChatEvent(state, event(1));
    applyChatEvent(state, {
      ...event(2),
      type: 'expired',
      conversationId: 'conversation',
    });
    expect(state.conversations).toEqual([]);
    expect(state.messages).toEqual([]);
  });
  it('receives an empty conversation and updates its availability without creating messages', () => {
    const state = snapshot();
    const opened = {
      ...event(1),
      type: 'conversation' as const,
      message: undefined,
    };
    applyChatEvent(state, opened);
    expect(state.conversations).toHaveLength(1);
    expect(state.messages).toEqual([]);
    const conversation = opened.conversation;
    if (!conversation) throw new Error('Missing conversation fixture');
    applyChatEvent(state, {
      ...opened,
      sequence: 2,
      conversation: { ...conversation, canReply: false },
    });
    expect(state.conversations[0]?.canReply).toBe(false);
    expect(state.conversations).toHaveLength(1);
    applyChatEvent(state, event(3, 'SENT'));
    expect(state.conversations).toHaveLength(1);
    expect(state.messages).toHaveLength(1);
  });
  it('bounds each conversation at 200 messages while retaining string platform identifiers', () => {
    const state = snapshot();
    for (let sequence = 1; sequence <= 201; sequence++) {
      const next = event(sequence);
      if (next.message) next.message.id = `message-${sequence}`;
      applyChatEvent(state, next);
    }
    expect(state.messages).toHaveLength(200);
    expect(state.messages[0]?.id).toBe('message-2');
    expect(state.conversations[0]?.platformOrderId).toBe(
      '20476365073825144832',
    );
  });
});
