<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';

import type { BusinessApi } from '#/api';

import { computed, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createManualPaymentOrderApi,
  getMerchantsApi,
  getPaymentOrderApi,
  getPaymentOrdersApi,
  reconcilePaymentOrderApi,
  rematchPaymentOrderApi,
} from '#/api';
import { runResourceAction } from '#/hooks';

import {
  businessEnumText,
  businessStateColor,
  formatBusinessTime,
  merchantPlatformText,
  validateBusinessForm,
} from '../shared/business-ui';
import BusinessScopeSelect from '../shared/BusinessScopeSelect.vue';

type PaymentOrderDetail = BusinessApi.PaymentOrder & {
  batchItems: BusinessApi.PaymentBatchItem[];
  history: BusinessApi.StatusHistory[];
};

const tenantId = ref('');
const merchantId = ref<string>();
const sourceType = ref<BusinessApi.PaymentSourceType>();
const status = ref<string>();
const merchants = ref<BusinessApi.Merchant[]>([]);
const items = ref<BusinessApi.PaymentOrder[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const createOpen = ref(false);
const detailOpen = ref(false);
const detail = ref<PaymentOrderDetail>();
const createFormRef = ref<FormInstance>();
const form = reactive<BusinessApi.ManualPaymentOrderInput>({
  amount: '',
  currency: 'CNY',
  executionMode: 'INSTANT',
  merchantId: '',
  payeeIdentity: '',
  payeeName: '',
  paymentMethod: 'ALIPAY',
  sourceBusinessNo: '',
});

const merchantOptions = computed(() =>
  merchants.value.map((merchant) => ({
    label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
    value: merchant.id,
  })),
);
const sourceOptions = ['C2C_BUY', 'BOT_MANUAL'].map((value) => ({
  label: businessEnumText(value),
  value,
}));
const statusOptions = [
  'PENDING_CONFIG',
  'READY',
  'SUBMITTING',
  'PROCESSING',
  'UNKNOWN',
  'SUCCESS',
  'PLATFORM_CONFIRM_PENDING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'FUND_EXCEPTION',
].map((value) => ({ label: businessEnumText(value), value }));

async function onScopeReady() {
  merchants.value = await getMerchantsApi({ tenantId: tenantId.value });
  await refresh(true);
}

async function refresh(resetPage = false) {
  if (!tenantId.value) return;
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const result = await getPaymentOrdersApi({
      merchantId: merchantId.value,
      page: page.value,
      pageSize: pageSize.value,
      sourceType: sourceType.value,
      status: status.value,
      tenantId: tenantId.value,
    });
    items.value = result.items;
    total.value = result.meta.totalItems;
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, {
    amount: '',
    currency: 'CNY',
    executionMode: 'INSTANT',
    merchantId: merchantId.value ?? merchants.value[0]?.id ?? '',
    payeeIdentity: '',
    payeeName: '',
    paymentMethod: 'ALIPAY',
    sourceBusinessNo: '',
    tenantId: tenantId.value,
  });
  createOpen.value = true;
}

async function submitCreate() {
  if (!(await validateBusinessForm(createFormRef.value))) return;
  await runResourceAction({
    action: () =>
      createManualPaymentOrderApi({ ...form, tenantId: tenantId.value }),
    onSuccess: async () => {
      createOpen.value = false;
      await refresh(true);
    },
    successMessage: '支付订单已创建',
  });
}

async function openDetail(order: BusinessApi.PaymentOrder) {
  detail.value = await getPaymentOrderApi(order.id, {
    tenantId: tenantId.value,
  });
  detailOpen.value = true;
}

async function runOrderAction(order: BusinessApi.PaymentOrder) {
  const reconcile = ['PROCESSING', 'UNKNOWN'].includes(order.status);
  await runResourceAction({
    action: () =>
      reconcile
        ? reconcilePaymentOrderApi(order.id, { tenantId: tenantId.value })
        : rematchPaymentOrderApi(order.id, { tenantId: tenantId.value }),
    onSuccess: () => refresh(),
    successMessage: reconcile ? '支付结果回查完成' : '支付方案重新匹配完成',
  });
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
            style="min-width: 220px"
            @change="refresh(true)"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">来源</div>
          <ASelect
            v-model:value="sourceType"
            allow-clear
            :options="sourceOptions"
            placeholder="全部来源"
            style="min-width: 160px"
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
            style="min-width: 170px"
            @change="refresh(true)"
          />
        </div>
      </div>
      <AButton
        v-access:code="['payment:order:create']"
        :disabled="merchants.length === 0"
        type="primary"
        @click="openCreate"
      >
        新增手工支付
      </AButton>
    </div>

    <ATable
      :data-source="items"
      :loading="loading"
      :pagination="{ current: page, pageSize, showSizeChanger: true, total }"
      row-key="id"
      :scroll="{ x: 1280 }"
      @change="
        (pagination) => onPageChange(pagination.current, pagination.pageSize)
      "
    >
      <ATableColumn data-index="paymentNo" title="支付单号" :width="210" />
      <ATableColumn key="source" title="来源" :width="140">
        <template #default="{ record }">
          {{ businessEnumText(record.sourceType) }}
        </template>
      </ATableColumn>
      <ATableColumn
        data-index="sourceBusinessNo"
        title="来源业务号"
        :width="180"
      />
      <ATableColumn key="amount" title="支付金额" :width="130">
        <template #default="{ record }">
          {{ record.amount }} {{ record.currency }}
        </template>
      </ATableColumn>
      <ATableColumn key="mode" title="支付通道" :width="120">
        <template #default="{ record }">
          {{ businessEnumText(record.executionMode) }}
        </template>
      </ATableColumn>
      <ATableColumn data-index="payeeName" title="收款人" :width="130" />
      <ATableColumn key="status" title="状态" :width="150">
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
      <ATableColumn key="action" fixed="right" title="操作" :width="180">
        <template #default="{ record }">
          <ASpace>
            <AButton size="small" type="link" @click="openDetail(record)">
              详情
            </AButton>
            <AButton
              v-if="
                ['PENDING_CONFIG', 'PROCESSING', 'UNKNOWN'].includes(
                  record.status,
                )
              "
              v-access:code="['payment:order:retry']"
              size="small"
              type="link"
              @click="runOrderAction(record)"
            >
              {{ record.status === 'PENDING_CONFIG' ? '重新匹配' : '回查' }}
            </AButton>
          </ASpace>
        </template>
      </ATableColumn>
    </ATable>

    <AModal v-model:open="createOpen" title="新增手工支付" @ok="submitCreate">
      <AForm ref="createFormRef" :model="form" layout="vertical">
        <AFormItem
          label="商家"
          name="merchantId"
          :rules="[{ required: true, message: '请选择商家' }]"
        >
          <ASelect v-model:value="form.merchantId" :options="merchantOptions" />
        </AFormItem>
        <AFormItem
          label="商户支付单号"
          name="sourceBusinessNo"
          :rules="[{ required: true, message: '请输入商户支付单号' }]"
        >
          <AInput v-model:value="form.sourceBusinessNo" :maxlength="128" />
        </AFormItem>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AFormItem
            label="支付金额"
            name="amount"
            :rules="[
              { required: true, message: '请输入支付金额' },
              {
                pattern: /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d*(?:\.\d{1,2})?)$/,
                message: '请输入大于零且最多两位小数的金额',
              },
            ]"
          >
            <AInput
              v-model:value="form.amount"
              inputmode="decimal"
              placeholder="例如 100.00"
            />
          </AFormItem>
          <AFormItem label="支付方式" required>
            <AInput value="支付宝" disabled />
          </AFormItem>
        </div>
        <AFormItem label="执行方式" required>
          <ARadioGroup v-model:value="form.executionMode">
            <ARadioButton value="INSTANT">商家转账</ARadioButton>
            <ARadioButton value="BATCH">批量有密</ARadioButton>
          </ARadioGroup>
        </AFormItem>
        <AFormItem
          label="收款人"
          name="payeeName"
          :rules="[{ required: true, message: '请输入收款人' }]"
        >
          <AInput v-model:value="form.payeeName" />
        </AFormItem>
        <AFormItem
          label="支付宝账号"
          name="payeeIdentity"
          :rules="[{ required: true, message: '请输入支付宝账号' }]"
        >
          <AInput v-model:value="form.payeeIdentity" />
        </AFormItem>
      </AForm>
    </AModal>

    <ADrawer
      v-model:open="detailOpen"
      title="支付订单详情"
      width="min(760px, 94vw)"
    >
      <template v-if="detail">
        <ADescriptions bordered :column="1" size="small">
          <ADescriptionsItem label="支付单号">
            {{ detail.paymentNo }}
          </ADescriptionsItem>
          <ADescriptionsItem label="来源业务号">
            {{ detail.sourceBusinessNo }}
          </ADescriptionsItem>
          <ADescriptionsItem label="金额">
            {{ detail.amount }} {{ detail.currency }}
          </ADescriptionsItem>
          <ADescriptionsItem label="收款信息">
            {{ detail.payeeName }} ·
            {{ detail.payeeIdentity }}
          </ADescriptionsItem>
          <ADescriptionsItem label="执行方式">
            {{ businessEnumText(detail.executionMode) }}
          </ADescriptionsItem>
          <ADescriptionsItem label="状态">
            {{ businessEnumText(detail.status) }}
          </ADescriptionsItem>
          <ADescriptionsItem v-if="detail.upstreamId" label="支付宝流水号">
            {{ detail.upstreamId }}
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
