<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';

import type { BusinessApi } from '#/api';

import { computed, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createPaymentBatchApi,
  getMerchantsApi,
  getPaymentAccountsApi,
  getPaymentBatchApi,
  getPaymentBatchesApi,
  getPaymentOrdersApi,
  reconcilePaymentBatchApi,
  submitPaymentBatchApi,
} from '#/api';
import { confirmResourceAction, runResourceAction } from '#/hooks';

import {
  businessEnumText,
  businessStateColor,
  formatBusinessTime,
  matchesPaymentRoute,
  merchantPlatformText,
  paymentRouteKey,
  validateBusinessForm,
} from '../shared/business-ui';
import BusinessScopeSelect from '../shared/BusinessScopeSelect.vue';

type BatchDetail = {
  batch: BusinessApi.PaymentBatch;
  items: BusinessApi.PaymentBatchItem[];
};

const tenantId = ref('');
const merchantId = ref<string>();
const paymentAccountId = ref<string>();
const status = ref<string>();
const merchants = ref<BusinessApi.Merchant[]>([]);
const accounts = ref<BusinessApi.PaymentAccount[]>([]);
const items = ref<BusinessApi.PaymentBatch[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const createOpen = ref(false);
const detailOpen = ref(false);
const detail = ref<BatchDetail>();
const candidateOrders = ref<BusinessApi.PaymentOrder[]>([]);
const candidateLoading = ref(false);
const createFormRef = ref<FormInstance>();
const createForm = reactive({
  merchantId: '',
  paymentOrderIds: [] as string[],
  routeKey: '',
});

const merchantOptions = computed(() =>
  merchants.value.map((merchant) => ({
    label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
    value: merchant.id,
  })),
);
const accountOptions = computed(() =>
  accounts.value.map((account) => ({ label: account.name, value: account.id })),
);
const routeOptions = computed(() => {
  const seen = new Set<string>();
  return candidateOrders.value.flatMap((order) => {
    const value = paymentRouteKey(order);
    if (!value || !order.paymentAccountId || !order.paymentAccountChannelId)
      return [];
    if (seen.has(value)) return [];
    seen.add(value);
    const account = accounts.value.find(
      ({ id }) => id === order.paymentAccountId,
    );
    const channel = account?.channels.find(
      ({ id }) => id === order.paymentAccountChannelId,
    );
    return [
      {
        label: `${account?.name ?? order.paymentAccountId} · ${channel?.channelName ?? order.paymentAccountChannelId} · ${order.currency}`,
        value,
      },
    ];
  });
});
const orderOptions = computed(() => {
  return candidateOrders.value
    .filter((order) => matchesPaymentRoute(order, createForm.routeKey))
    .map((order) => ({
      label: `${order.paymentNo} · ${order.amount} ${order.currency} · ${order.payeeName}`,
      value: order.id,
    }));
});
const statusOptions = [
  'READY',
  'SUBMITTING',
  'PROCESSING',
  'UNKNOWN',
  'SUCCESS',
  'PARTIAL_SUCCESS',
  'FAILED',
  'CANCELLED',
  'EXCEPTION',
].map((value) => ({ label: businessEnumText(value), value }));

async function onScopeReady() {
  [merchants.value, accounts.value] = await Promise.all([
    getMerchantsApi({ tenantId: tenantId.value }),
    getPaymentAccountsApi({ tenantId: tenantId.value }),
  ]);
  await refresh(true);
}

async function refresh(resetPage = false) {
  if (!tenantId.value) return;
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const result = await getPaymentBatchesApi({
      merchantId: merchantId.value,
      page: page.value,
      pageSize: pageSize.value,
      paymentAccountId: paymentAccountId.value,
      status: status.value,
      tenantId: tenantId.value,
    });
    items.value = result.items;
    total.value = result.meta.totalItems;
  } finally {
    loading.value = false;
  }
}

async function openCreate() {
  Object.assign(createForm, {
    merchantId: merchantId.value ?? merchants.value[0]?.id ?? '',
    paymentOrderIds: [],
    routeKey: '',
  });
  createOpen.value = true;
  await loadCandidates();
}

async function loadCandidates() {
  createForm.paymentOrderIds = [];
  createForm.routeKey = '';
  if (!createForm.merchantId) {
    candidateOrders.value = [];
    return;
  }
  candidateLoading.value = true;
  try {
    const candidates: BusinessApi.PaymentOrder[] = [];
    let currentPage = 1;
    let totalPages = 1;
    while (currentPage <= totalPages && candidates.length < 500) {
      const result = await getPaymentOrdersApi({
        executionMode: 'BATCH',
        merchantId: createForm.merchantId,
        page: currentPage,
        pageSize: 100,
        status: 'READY',
        tenantId: tenantId.value,
      });
      candidates.push(...result.items);
      totalPages = result.meta.totalPages;
      currentPage += 1;
    }
    candidateOrders.value = candidates.slice(0, 500);
  } finally {
    candidateLoading.value = false;
  }
}

function onRouteChange() {
  createForm.paymentOrderIds = [];
}

async function submitCreate() {
  if (!(await validateBusinessForm(createFormRef.value))) return;
  await runResourceAction({
    action: () =>
      createPaymentBatchApi({
        paymentOrderIds: createForm.paymentOrderIds,
        tenantId: tenantId.value,
      }),
    onSuccess: async () => {
      createOpen.value = false;
      await refresh(true);
    },
    successMessage: '支付批次已创建',
  });
}

async function openDetail(batch: BusinessApi.PaymentBatch) {
  detail.value = await getPaymentBatchApi(batch.id, {
    tenantId: tenantId.value,
  });
  detailOpen.value = true;
}

function submitBatch(batch: BusinessApi.PaymentBatch) {
  confirmResourceAction({
    action: () => submitPaymentBatchApi(batch.id, { tenantId: tenantId.value }),
    content: `批次共 ${batch.totalCount} 笔，合计 ${batch.totalAmount} ${batch.currency}`,
    onSuccess: () => refresh(),
    successMessage: '支付批次已提交',
    title: '确认提交该支付批次？',
  });
}

async function reconcileBatch(batch: BusinessApi.PaymentBatch) {
  await runResourceAction({
    action: () =>
      reconcilePaymentBatchApi(batch.id, { tenantId: tenantId.value }),
    onSuccess: () => refresh(),
    successMessage: '支付批次回查完成',
  });
}

function accountName(id: string) {
  return accounts.value.find((account) => account.id === id)?.name ?? id;
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
            allow-clear
            :options="merchantOptions"
            placeholder="全部商家"
            style="min-width: 210px"
            @change="refresh(true)"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">支付账号</div>
          <ASelect
            v-model:value="paymentAccountId"
            allow-clear
            :options="accountOptions"
            placeholder="全部账号"
            style="min-width: 180px"
            @change="refresh(true)"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">状态</div>
          <ASelect
            v-model:value="status"
            allow-clear
            :options="statusOptions"
            placeholder="全部状态"
            style="min-width: 160px"
            @change="refresh(true)"
          />
        </div>
      </div>
      <AButton
        v-access:code="['payment:batch:create']"
        :disabled="merchants.length === 0"
        type="primary"
        @click="openCreate"
      >
        创建支付批次
      </AButton>
    </div>

    <ATable
      :data-source="items"
      :loading="loading"
      :pagination="{ current: page, pageSize, showSizeChanger: true, total }"
      row-key="id"
      :scroll="{ x: 1300 }"
      @change="
        (pagination) => onPageChange(pagination.current, pagination.pageSize)
      "
    >
      <ATableColumn data-index="batchNo" title="批次号" :width="210" />
      <ATableColumn key="account" title="支付账号" :width="170">
        <template #default="{ record }">
          {{ accountName(record.paymentAccountId) }}
        </template>
      </ATableColumn>
      <ATableColumn key="total" title="批次汇总" :width="170">
        <template #default="{ record }">
          {{ record.totalCount }} 笔 · {{ record.totalAmount }}
          {{ record.currency }}
        </template>
      </ATableColumn>
      <ATableColumn key="progress" title="处理结果" :width="210">
        <template #default="{ record }">
          成功 {{ record.successCount }} / 失败 {{ record.failedCount }} / 未知
          {{ record.unknownCount }}
        </template>
      </ATableColumn>
      <ATableColumn key="status" title="状态" :width="140">
        <template #default="{ record }">
          <ATag :color="businessStateColor(record.status)">
            {{ businessEnumText(record.status) }}
          </ATag>
        </template>
      </ATableColumn>
      <ATableColumn key="createdAt" title="创建时间" :width="190">
        <template #default="{ record }">
          {{ formatBusinessTime(record.createdAt) }}
        </template>
      </ATableColumn>
      <ATableColumn key="action" fixed="right" title="操作" :width="210">
        <template #default="{ record }">
          <ASpace>
            <AButton size="small" type="link" @click="openDetail(record)">
              详情
            </AButton>
            <AButton
              v-if="record.status === 'READY'"
              v-access:code="['payment:batch:submit']"
              size="small"
              type="link"
              @click="submitBatch(record)"
            >
              提交
            </AButton>
            <AButton
              v-if="['PROCESSING', 'UNKNOWN'].includes(record.status)"
              v-access:code="['payment:batch:retry']"
              size="small"
              type="link"
              @click="reconcileBatch(record)"
            >
              回查
            </AButton>
          </ASpace>
        </template>
      </ATableColumn>
    </ATable>

    <AModal v-model:open="createOpen" title="创建支付批次" @ok="submitCreate">
      <AForm ref="createFormRef" :model="createForm" layout="vertical">
        <AFormItem
          label="商家"
          name="merchantId"
          :rules="[{ required: true, message: '请选择商家' }]"
        >
          <ASelect
            v-model:value="createForm.merchantId"
            :options="merchantOptions"
            @change="loadCandidates"
          />
        </AFormItem>
        <AFormItem
          label="支付账号与通道"
          name="routeKey"
          :rules="[{ required: true, message: '请选择支付账号与通道' }]"
        >
          <ASelect
            v-model:value="createForm.routeKey"
            :loading="candidateLoading"
            :options="routeOptions"
            placeholder="选择同一支付路由"
            @change="onRouteChange"
          />
        </AFormItem>
        <AFormItem
          label="待提交支付订单"
          name="paymentOrderIds"
          :rules="[
            {
              required: true,
              type: 'array',
              min: 1,
              message: '请选择至少一笔支付订单',
            },
          ]"
        >
          <ASelect
            v-model:value="createForm.paymentOrderIds"
            :disabled="!createForm.routeKey"
            mode="multiple"
            :options="orderOptions"
            placeholder="选择 1 至 500 笔订单"
          />
        </AFormItem>
        <AAlert
          v-if="candidateOrders.length === 0"
          message="该商家当前没有可组批的待提交订单"
          show-icon
          type="info"
        />
      </AForm>
    </AModal>

    <ADrawer
      v-model:open="detailOpen"
      title="支付批次详情"
      width="min(780px, 94vw)"
    >
      <template v-if="detail">
        <ADescriptions bordered :column="1" size="small">
          <ADescriptionsItem label="批次号">
            {{ detail.batch.batchNo }}
          </ADescriptionsItem>
          <ADescriptionsItem label="支付账号">
            {{ accountName(detail.batch.paymentAccountId) }}
          </ADescriptionsItem>
          <ADescriptionsItem label="批次金额">
            {{ detail.batch.totalAmount }}
            {{ detail.batch.currency }}
          </ADescriptionsItem>
          <ADescriptionsItem label="当前状态">
            {{ businessEnumText(detail.batch.status) }}
          </ADescriptionsItem>
          <ADescriptionsItem
            v-if="detail.batch.upstreamId"
            label="支付宝批次号"
          >
            {{ detail.batch.upstreamId }}
          </ADescriptionsItem>
          <ADescriptionsItem v-if="detail.batch.lastError" label="异常原因">
            {{ detail.batch.lastError }}
          </ADescriptionsItem>
        </ADescriptions>
        <ADivider orientation="left">批次明细</ADivider>
        <ATable
          :data-source="detail.items"
          row-key="id"
          size="small"
          :scroll="{ x: 680 }"
        >
          <ATableColumn
            data-index="paymentOrderId"
            title="支付订单"
            :width="260"
          />
          <ATableColumn data-index="amount" title="金额" :width="100" />
          <ATableColumn key="status" title="状态" :width="120">
            <template #default="{ record }">
              {{ businessEnumText(record.status) }}
            </template>
          </ATableColumn>
          <ATableColumn data-index="errorMessage" title="结果说明">
            <template #default="{ text }">{{ text || '-' }}</template>
          </ATableColumn>
        </ATable>
      </template>
    </ADrawer>
  </Page>
</template>
