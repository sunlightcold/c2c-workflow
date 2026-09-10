<script lang="ts" setup>
import type { BusinessApi } from '#/api';

import { computed, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  getMerchantOrderApi,
  getMerchantOrdersApi,
  getMerchantsApi,
  syncMerchantOrdersApi,
} from '#/api';
import { runResourceAction } from '#/hooks';

import {
  businessEnumText,
  businessStateColor,
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import BusinessScopeSelect from '../shared/BusinessScopeSelect.vue';

const tenantId = ref('');
const merchantId = ref('');
const status = ref<string>();
const merchants = ref<BusinessApi.Merchant[]>([]);
const items = ref<BusinessApi.MerchantOrder[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const detailOpen = ref(false);
const detail = ref<
  BusinessApi.MerchantOrder & { history: BusinessApi.StatusHistory[] }
>();

const merchantOptions = computed(() =>
  merchants.value.map((merchant) => ({
    label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
    value: merchant.id,
  })),
);
const statusOptions = [
  'NEW',
  'PENDING_PAYMENT',
  'PAYMENT_PROCESSING',
  'PAID_PENDING_PLATFORM_CONFIRM',
  'PENDING_RELEASE',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED',
  'DISPUTED',
  'FUNDS_EXCEPTION',
  'EXCEPTION',
].map((value) => ({ label: businessEnumText(value), value }));

async function onScopeReady() {
  merchants.value = await getMerchantsApi({ tenantId: tenantId.value });
  merchantId.value = merchants.value[0]?.id ?? '';
  await refresh();
}

async function refresh(resetPage = false) {
  if (!tenantId.value || !merchantId.value) {
    items.value = [];
    total.value = 0;
    return;
  }
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const result = await getMerchantOrdersApi({
      merchantId: merchantId.value,
      page: page.value,
      pageSize: pageSize.value,
      status: status.value,
      tenantId: tenantId.value,
    });
    items.value = result.items;
    total.value = result.meta.totalItems;
  } finally {
    loading.value = false;
  }
}

async function syncOrders() {
  if (!merchantId.value) return;
  await runResourceAction({
    action: () =>
      syncMerchantOrdersApi(merchantId.value, { tenantId: tenantId.value }),
    onSuccess: () => refresh(true),
    successMessage: '商家订单同步完成',
  });
}

async function openDetail(order: BusinessApi.MerchantOrder) {
  detail.value = await getMerchantOrderApi(order.id, {
    merchantId: order.merchantId,
    tenantId: tenantId.value,
  });
  detailOpen.value = true;
}

function onPageChange(nextPage?: number, nextPageSize?: number) {
  page.value = nextPage ?? page.value;
  pageSize.value = nextPageSize ?? pageSize.value;
  refresh();
}
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-end gap-3">
        <BusinessScopeSelect v-model="tenantId" @ready="onScopeReady" />
        <div>
          <div class="mb-1 text-sm font-medium">商家</div>
          <ASelect
            v-model:value="merchantId"
            :options="merchantOptions"
            placeholder="选择商家"
            show-search
            style="min-width: 240px"
            @change="refresh(true)"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">订单状态</div>
          <ASelect
            v-model:value="status"
            allow-clear
            :options="statusOptions"
            placeholder="全部状态"
            style="min-width: 180px"
            @change="refresh(true)"
          />
        </div>
      </div>
      <AButton
        v-access:code="['merchant:order:sync']"
        :disabled="!merchantId"
        type="primary"
        @click="syncOrders"
      >
        同步订单
      </AButton>
    </div>

    <AAlert
      v-if="tenantId && merchants.length === 0"
      class="mb-3"
      message="当前经营单位尚未创建商家"
      show-icon
      type="info"
    />
    <ATable
      :data-source="items"
      :loading="loading"
      :pagination="{
        current: page,
        pageSize,
        showSizeChanger: true,
        total,
      }"
      row-key="id"
      :scroll="{ x: 1240 }"
      @change="
        (pagination) => onPageChange(pagination.current, pagination.pageSize)
      "
    >
      <ATableColumn
        data-index="platformOrderId"
        title="平台订单号"
        :width="190"
      />
      <ATableColumn key="platform" title="平台" :width="90">
        <template #default="{ record }">
          {{ merchantPlatformText(record.platform) }}
        </template>
      </ATableColumn>
      <ATableColumn key="amount" title="订单金额" :width="140">
        <template #default="{ record }">
          {{ record.fiatAmount }} {{ record.fiatCurrency }}
        </template>
      </ATableColumn>
      <ATableColumn key="asset" title="买入数量" :width="150">
        <template #default="{ record }">
          {{ record.assetAmount }} {{ record.asset }}
        </template>
      </ATableColumn>
      <ATableColumn data-index="counterpartyName" title="交易对象" :width="140">
        <template #default="{ text }">{{ text || '-' }}</template>
      </ATableColumn>
      <ATableColumn key="status" title="业务状态" :width="150">
        <template #default="{ record }">
          <ATag :color="businessStateColor(record.status)">
            {{ businessEnumText(record.status) }}
          </ATag>
        </template>
      </ATableColumn>
      <ATableColumn key="deadline" title="支付截止时间" :width="190">
        <template #default="{ record }">
          {{ formatBusinessTime(record.paymentDeadline) }}
        </template>
      </ATableColumn>
      <ATableColumn key="action" fixed="right" title="操作" :width="90">
        <template #default="{ record }">
          <AButton size="small" type="link" @click="openDetail(record)">
            详情
          </AButton>
        </template>
      </ATableColumn>
    </ATable>

    <ADrawer
      v-model:open="detailOpen"
      title="商家订单详情"
      width="min(760px, 94vw)"
    >
      <template v-if="detail">
        <ADescriptions bordered :column="1" size="small">
          <ADescriptionsItem label="平台订单号">
            {{ detail.platformOrderId }}
          </ADescriptionsItem>
          <ADescriptionsItem label="金额">
            {{ detail.fiatAmount }}
            {{ detail.fiatCurrency }}
          </ADescriptionsItem>
          <ADescriptionsItem label="收款人">
            {{ detail.payeeName || '-' }}
          </ADescriptionsItem>
          <ADescriptionsItem label="收款账号">
            {{ detail.payeeIdentity || '-' }}
          </ADescriptionsItem>
          <ADescriptionsItem label="支付方式">
            {{ detail.paymentMethod || '-' }}
          </ADescriptionsItem>
          <ADescriptionsItem label="当前状态">
            {{ businessEnumText(detail.status) }}
          </ADescriptionsItem>
          <ADescriptionsItem v-if="detail.lastError" label="异常原因">
            {{ detail.lastError }}
          </ADescriptionsItem>
        </ADescriptions>
        <ADivider orientation="left">状态时间线</ADivider>
        <ATimeline>
          <ATimelineItem v-for="item in detail.history" :key="item.id">
            <div class="font-medium">{{ businessEnumText(item.toStatus) }}</div>
            <div class="text-muted-foreground text-sm">
              {{ formatBusinessTime(item.createdAt) }} · {{ item.source }}
            </div>
            <div v-if="item.reason" class="mt-1 text-sm">{{ item.reason }}</div>
          </ATimelineItem>
        </ATimeline>
      </template>
    </ADrawer>
  </Page>
</template>
