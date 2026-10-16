import type { MerchantChatApi } from '#/api';

import { describe, expect, it } from 'vitest';

import {
  applyChatEvent,
  chatConversationItems,
  chatPaymentStatusText,
  formatChatDecimal,
} from './chat-state';

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
      order: {
        fiatAmount: '117.35',
        fiatCurrency: 'CNY',
        assetAmount: '16.500000000000000000',
        asset: 'USDT',
        unitPrice: '7.11',
        status: 'PENDING_PAYMENT',
        paymentStatus: null,
        paymentMethod: 'ALIPAY',
        platformCreatedAt: '2026-10-16T01:00:00Z',
        paymentDeadline: null,
      },
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
  it('distinguishes payment state, no payment order and a legacy response', () => {
    expect(chatPaymentStatusText('SUCCESS')).toBe('支付成功');
    expect(chatPaymentStatusText('PROCESSING')).toBe('处理中');
    expect(chatPaymentStatusText('UNKNOWN')).toBe('结果未知');
    expect(chatPaymentStatusText(null)).toBe('未创建');
  });
  it('updates payment state independently of merchant status without changing message time', () => {
    const state = snapshot();
    const initial = event(1);
    applyChatEvent(state, initial);
    const conversation = state.conversations[0];
    if (!conversation) throw new Error('Missing conversation fixture');
    applyChatEvent(state, {
      ...initial,
      sequence: 2,
      type: 'conversation',
      message: undefined,
      conversation: {
        ...conversation,
        order: { ...conversation.order, paymentStatus: 'SUCCESS' },
      },
    });
    expect(state.conversations[0]?.order.status).toBe('PENDING_PAYMENT');
    expect(state.conversations[0]?.order.paymentStatus).toBe('SUCCESS');
    expect(state.conversations[0]?.updatedAt).toBe(conversation.updatedAt);
    expect(state.messages).toHaveLength(1);
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
  it('searches conversation context and previews the latest received message', () => {
    const state = snapshot();
    applyChatEvent(state, event(1));
    const message = event(2).message;
    if (!message) throw new Error('Missing message fixture');
    applyChatEvent(state, {
      ...event(2),
      message: {
        ...message,
        id: 'image',
        type: 'IMAGE',
        text: undefined,
        receivedAt: '2099-01-01T00:00:00Z',
      },
    });
    expect(chatConversationItems(state, 'buyer')[0]?.preview).toBe(
      '商家：[图片]',
    );
    expect(chatConversationItems(state, '20476365073825144832')).toHaveLength(
      1,
    );
    expect(chatConversationItems(state, 'missing')).toEqual([]);
    expect(formatChatDecimal('16.500000000000000000')).toBe('16.5');
    expect(formatChatDecimal('1000')).toBe('1000');
    expect(formatChatDecimal('0.000000000000000001')).toBe(
      '0.000000000000000001',
    );
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
