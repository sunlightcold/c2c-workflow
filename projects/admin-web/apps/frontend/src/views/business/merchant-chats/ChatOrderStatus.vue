<script setup lang="ts">
import type { MerchantChatApi } from '#/api';

import { businessEnumText, businessStateColor } from '../shared/business-ui';
import { chatPaymentStatusText } from './chat-state';

defineProps<{
  compact?: boolean;
  order: MerchantChatApi.OrderSummary;
}>();
</script>

<template>
  <div
    class="flex items-center gap-x-3 gap-y-1 text-xs"
    :class="compact ? 'flex-nowrap' : 'flex-wrap'"
  >
    <span
      class="inline-flex items-center gap-1 whitespace-nowrap"
      title="支付订单状态"
    >
      <span class="text-muted-foreground">{{
        compact ? '支付' : '支付订单'
      }}</span>
      <a-tag
        class="!m-0"
        :color="
          order.paymentStatus
            ? businessStateColor(order.paymentStatus)
            : 'default'
        "
      >
        {{ chatPaymentStatusText(order.paymentStatus) }}
      </a-tag>
    </span>
    <span
      class="inline-flex items-center gap-1 whitespace-nowrap"
      title="商家订单状态"
    >
      <span class="text-muted-foreground">{{
        compact ? '商家' : '商家订单'
      }}</span>
      <a-tag class="!m-0" :color="businessStateColor(order.status)">
        {{ businessEnumText(order.status) }}
      </a-tag>
    </span>
  </div>
</template>
