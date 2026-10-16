import { ref } from 'vue';

import { defineStore } from 'pinia';

export interface MerchantChatTarget {
  merchantId: string;
  merchantOrderId?: string;
  tenantId: string;
}

export const useMerchantChatNavigationStore = defineStore(
  'merchant-chat-navigation',
  () => {
    const pendingTarget = ref<MerchantChatTarget>();

    function openTarget(target: MerchantChatTarget) {
      pendingTarget.value = target;
    }

    function takeTarget() {
      const target = pendingTarget.value;
      pendingTarget.value = undefined;
      return target;
    }

    function $reset() {
      pendingTarget.value = undefined;
    }

    return { $reset, openTarget, pendingTarget, takeTarget };
  },
);
