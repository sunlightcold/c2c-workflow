<script setup lang="ts">
import type { MerchantChatApi } from '#/api';

import { h, onBeforeUnmount, ref, watch } from 'vue';

import { Button } from 'ant-design-vue';

import { queryMerchantOrderUpstreamApi } from '#/api';
import { BaseModal } from '#/components/base-modal';

import { businessModalProps } from '../shared/business-form-layout';
import {
  businessEnumText,
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { formatChatDecimal } from './chat-state';
import ChatOrderStatus from './ChatOrderStatus.vue';

const props = defineProps<{
  conversation: MerchantChatApi.Conversation;
  merchant?: MerchantChatApi.Merchant;
}>();
const paymentCodeOpen = ref(false);
const paymentCodeLoading = ref(false);
const paymentCodeUrl = ref('');
const paymentCodeError = ref('');
let paymentCodeVersion = 0;

function closePaymentCode() {
  paymentCodeVersion++;
  paymentCodeOpen.value = false;
  paymentCodeLoading.value = false;
  paymentCodeUrl.value = '';
  paymentCodeError.value = '';
}

async function openPaymentCode() {
  const current = ++paymentCodeVersion;
  paymentCodeOpen.value = true;
  paymentCodeLoading.value = true;
  paymentCodeUrl.value = '';
  paymentCodeError.value = '';
  const conversation = props.conversation;
  try {
    const result = await queryMerchantOrderUpstreamApi(
      conversation.merchantOrderId,
      {
        tenantId: conversation.tenantId,
        merchantId: conversation.merchantId,
      },
    );
    if (current !== paymentCodeVersion) return;
    paymentCodeUrl.value = result.qrCodeUrl ?? '';
    if (!paymentCodeUrl.value)
      paymentCodeError.value = '该订单暂未提供可用的付款码';
  } catch {
    if (current === paymentCodeVersion)
      paymentCodeError.value = '付款码获取失败，请关闭后重试';
  } finally {
    if (current === paymentCodeVersion) paymentCodeLoading.value = false;
  }
}

watch(() => props.conversation.id, closePaymentCode);
onBeforeUnmount(closePaymentCode);
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
      <a-button
        v-access:code="['merchant:order:read']"
        block
        class="mt-3"
        :loading="paymentCodeLoading"
        @click="openPaymentCode"
      >
        查看付款码
      </a-button>
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
  <BaseModal
    v-model="paymentCodeOpen"
    v-bind="businessModalProps('用户付款码', 420)"
    closable
    :footer="h(Button, { onClick: closePaymentCode }, () => '关闭')"
    @cancel="closePaymentCode"
  >
    <div class="flex min-h-64 items-center justify-center p-4">
      <a-spin v-if="paymentCodeLoading" />
      <p
        v-else-if="paymentCodeError"
        class="text-muted-foreground text-sm"
        role="status"
      >
        {{ paymentCodeError }}
      </p>
      <a-image
        v-else-if="paymentCodeUrl"
        :src="paymentCodeUrl"
        :width="280"
        alt="用户付款码"
        class="max-w-full"
        referrerpolicy="no-referrer"
        @error="paymentCodeError = '付款码图片加载失败，请关闭后重试'"
      />
    </div>
  </BaseModal>
</template>
