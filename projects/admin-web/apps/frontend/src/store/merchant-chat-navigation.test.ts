import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { useMerchantChatNavigationStore } from './merchant-chat-navigation';

const firstOrder = {
  merchantId: 'merchant-1',
  merchantOrderId: 'order-1',
  tenantId: 'tenant-1',
};

describe('merchant chat navigation', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('shares the order in memory and consumes it once', () => {
    useMerchantChatNavigationStore().openTarget(firstOrder);
    const destination = useMerchantChatNavigationStore();

    expect(destination.takeTarget()).toEqual(firstOrder);
    expect(destination.pendingTarget).toBeUndefined();
    expect(destination.takeTarget()).toBeUndefined();
  });

  it('uses the latest order for repeated navigation', () => {
    const store = useMerchantChatNavigationStore();
    store.openTarget(firstOrder);
    const nextOrder = { ...firstOrder, merchantOrderId: 'order-2' };
    store.openTarget(nextOrder);

    expect(store.takeTarget()).toEqual(nextOrder);
  });

  it('opens a merchant scope without carrying a previous order', () => {
    const store = useMerchantChatNavigationStore();
    store.openTarget(firstOrder);
    const merchant = { merchantId: 'merchant-2', tenantId: 'tenant-2' };
    store.openTarget(merchant);

    expect(store.takeTarget()).toEqual(merchant);
    expect(store.takeTarget()).toBeUndefined();
  });

  it('does not restore the order in a new application instance', () => {
    useMerchantChatNavigationStore().openTarget(firstOrder);
    setActivePinia(createPinia());

    expect(useMerchantChatNavigationStore().takeTarget()).toBeUndefined();
  });

  it('clears the pending order when stores reset on logout', () => {
    const store = useMerchantChatNavigationStore();
    store.openTarget(firstOrder);
    store.$reset();

    expect(store.takeTarget()).toBeUndefined();
  });
});
