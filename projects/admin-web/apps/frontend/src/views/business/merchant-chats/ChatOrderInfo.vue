<script setup lang="ts">
import type { MerchantChatApi } from '#/api';

import {
  businessEnumText,
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { formatChatDecimal } from './chat-state';
import ChatOrderStatus from './ChatOrderStatus.vue';

defineProps<{
  conversation: MerchantChatApi.Conversation;
  merchant?: MerchantChatApi.Merchant;
}>();
</script>

<template>
  <div class="space-y-5 p-5">
    <div>
      <div class="text-muted-foreground mb-2 text-xs">订单金额</div>
      <div class="text-2xl font-semibold tabular-nums">
        {{ conversation.order.fiatAmount }}
        <span class="text-muted-foreground text-sm font-normal">{{
          conversation.order.fiatCurrency
        }}</span>
      </div>
      <div class="mt-2">
        <ChatOrderStatus :order="conversation.order" />
      </div>
    </div>
    <dl class="space-y-4 text-sm">
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">买家</dt>
        <dd class="break-words">{{ conversation.buyerName }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">平台订单号</dt>
        <dd>
          <a-typography-paragraph
            class="!mb-0 break-all"
            :copyable="{ text: conversation.platformOrderId }"
          >
            {{ conversation.platformOrderId }}
          </a-typography-paragraph>
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">数量</dt>
        <dd class="break-all tabular-nums">
          {{ formatChatDecimal(conversation.order.assetAmount) }}
          {{ conversation.order.asset }}
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">单价</dt>
        <dd class="break-all tabular-nums">
          {{
            conversation.order.unitPrice === null
              ? '—'
              : `${formatChatDecimal(conversation.order.unitPrice)} ${conversation.order.fiatCurrency} / ${conversation.order.asset}`
          }}
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">支付方式</dt>
        <dd>
          {{
            conversation.order.paymentMethod
              ? businessEnumText(conversation.order.paymentMethod)
              : '—'
          }}
        </dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">商家账号</dt>
        <dd class="break-words">{{ merchant?.name ?? '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">交易平台</dt>
        <dd>{{ merchant ? merchantPlatformText(merchant.platform) : '—' }}</dd>
      </div>
      <div>
        <dt class="text-muted-foreground mb-1 text-xs">下单时间</dt>
        <dd>{{ formatBusinessTime(conversation.order.platformCreatedAt) }}</dd>
      </div>
      <div v-if="conversation.order.paymentDeadline">
        <dt class="text-muted-foreground mb-1 text-xs">支付截止</dt>
        <dd>{{ formatBusinessTime(conversation.order.paymentDeadline) }}</dd>
      </div>
    </dl>
  </div>
</template>
