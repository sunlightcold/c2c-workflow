<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, reactive, ref } from 'vue';

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
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import { createPaymentBatchModalOptions } from '../shared/business-form-schemas';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessEnumText,
  businessStateColor,
  matchesPaymentRoute,
  merchantPlatformText,
  paymentRouteKey,
  resolveBusinessEndTime,
  resolvePaymentRoute,
} from '../shared/business-ui';
import OrderTimeCell from '../shared/OrderTimeCell.vue';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

type BatchDetail = {
  batch: BusinessApi.PaymentBatch;
  items: BusinessApi.PaymentBatchItem[];
};
type SearchValues = {
  merchantId?: string;
  paymentAccountId?: string;
  status?: string;
  tenantId?: string;
};
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const merchants = ref<BusinessApi.Merchant[]>([]);
const accounts = ref<BusinessApi.PaymentAccount[]>([]);
const merchantOptions = reactive<Array<{ label: string; value: string }>>([]);
const accountOptions = reactive<Array<{ label: string; value: string }>>([]);
const detailOpen = ref(false);
const detail = ref<BatchDetail>();

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

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => void selectTenant(value, true),
        options: tenantOptions,
        placeholder: '请选择经营单位',
        showSearch: true,
      }),
      fieldName: 'tenantId',
      label: '经营单位',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        options: merchantOptions,
        placeholder: '全部商家',
      }),
      fieldName: 'merchantId',
      label: '商家',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        options: accountOptions,
        placeholder: '全部账号',
      }),
      fieldName: 'paymentAccountId',
      label: '支付账号',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: statusOptions,
        placeholder: '全部状态',
      },
      fieldName: 'status',
      label: '状态',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.PaymentBatch> = {
  cellConfig: { height: 75 },
  columns: [
    { type: 'seq', width: 70 },
    { field: 'batchNo', title: '批次号', minWidth: 200 },
    {
      field: 'paymentAccountId',
      title: '转账账号 / 通道',
      minWidth: 230,
      slots: { default: 'paymentRoute' },
    },
    {
      field: 'totalAmount',
      title: '批次汇总',
      width: 180,
      slots: { default: 'total' },
    },
    {
      field: 'successCount',
      title: '处理结果',
      width: 220,
      slots: { default: 'progress' },
    },
    {
      field: 'status',
      title: '状态',
      width: 140,
      slots: { default: 'status' },
    },
    {
      field: 'orderTime',
      slots: { default: 'orderTime' },
      title: '订单时间',
      width: 215,
    },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 220,
      slots: { default: 'action' },
    },
  ],
};

const [Grid, gApi] = useResourceGrid<
  BusinessApi.PaymentBatch,
  SearchValues,
  QueryParams
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    pageIndex: page.currentPage,
    pageSize: page.pageSize,
  }),
  query: async (params) => {
    if (!params.tenantId) {
      return createEmptyBusinessPage(params.pageIndex, params.pageSize);
    }
    return getPaymentBatchesApi({
      merchantId: params.merchantId,
      page: params.pageIndex,
      pageSize: params.pageSize,
      paymentAccountId: params.paymentAccountId,
      status: params.status,
      tenantId: params.tenantId,
    });
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string, refresh: boolean) {
  selectedTenantId.value = tenantId;
  await gApi.formApi.setFieldValue('tenantId', tenantId);
  [merchants.value, accounts.value] = await Promise.all([
    tenantId ? getMerchantsApi({ tenantId }) : Promise.resolve([]),
    tenantId ? getPaymentAccountsApi({ tenantId }) : Promise.resolve([]),
  ]);
  merchantOptions.splice(
    0,
    merchantOptions.length,
    ...merchants.value.map((merchant) => ({
      disabled: merchant.status !== 'active',
      label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
      value: merchant.id,
    })),
  );
  accountOptions.splice(
    0,
    accountOptions.length,
    ...accounts.value.map((account) => ({
      disabled: account.status !== 'active',
      label: account.name,
      value: account.id,
    })),
  );
  await Promise.all([
    gApi.formApi.setFieldValue('merchantId', undefined),
    gApi.formApi.setFieldValue('paymentAccountId', undefined),
  ]);
  gApi.formApi.setLatestSubmissionValues(
    (await gApi.formApi.getValues()) as SearchValues,
  );
  if (refresh) await gApi.query();
}

async function loadRoutes(merchantId: string) {
  const candidates: BusinessApi.PaymentOrder[] = [];
  let currentPage = 1;
  let totalPages = 1;
  while (currentPage <= totalPages && candidates.length < 500) {
    const result = await getPaymentOrdersApi({
      executionMode: 'BATCH',
      merchantId,
      page: currentPage,
      pageSize: 100,
      status: 'READY',
      tenantId: selectedTenantId.value,
    });
    candidates.push(...result.items);
    totalPages = result.meta.totalPages;
    currentPage += 1;
  }
  const seen = new Set<string>();
  return candidates.flatMap((order) => {
    const value = paymentRouteKey(order);
    if (
      !value ||
      !order.paymentAccountId ||
      !order.paymentAccountChannelId ||
      seen.has(value)
    )
      return [];
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
        orders: candidates
          .filter((candidate) => matchesPaymentRoute(candidate, value))
          .map((candidate) => ({
            label: `${candidate.paymentNo} · ${candidate.amount} ${candidate.currency} · ${candidate.payeeName}`,
            value: candidate.id,
          })),
        value,
      },
    ];
  });
}

function openCreate() {
  formModalShow(
    createPaymentBatchModalOptions({ loadRoutes, merchants: merchantOptions }),
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as { paymentOrderIds: string[] };
        await runResourceAction({
          action: () =>
            createPaymentBatchApi({
              paymentOrderIds: data.paymentOrderIds,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gApi.reload();
          },
          successMessage: '支付批次已创建',
        });
      },
    },
  );
}

async function openDetail(batch: BusinessApi.PaymentBatch) {
  detail.value = await getPaymentBatchApi(batch.id, {
    tenantId: selectedTenantId.value,
  });
  detailOpen.value = true;
}

function submitBatch(batch: BusinessApi.PaymentBatch) {
  confirmResourceAction({
    action: () =>
      submitPaymentBatchApi(batch.id, { tenantId: selectedTenantId.value }),
    content: `批次共 ${batch.totalCount} 笔，合计 ${batch.totalAmount} ${batch.currency}`,
    onSuccess: () => gApi.query(),
    successMessage: '支付批次已提交',
    title: '确认提交该支付批次？',
  });
}

async function reconcileBatch(batch: BusinessApi.PaymentBatch) {
  await runResourceAction({
    action: () =>
      reconcilePaymentBatchApi(batch.id, {
        tenantId: selectedTenantId.value,
      }),
    onSuccess: () => gApi.query(),
    successMessage: '支付批次回查完成',
  });
}

function paymentRoute(accountId: string, channelId: string) {
  return resolvePaymentRoute(accounts.value, accountId, channelId);
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (!selectedTenantId.value) return;
  await selectTenant(selectedTenantId.value, false);
  await gApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['payment:batch:create']"
          :disabled="merchants.length === 0"
          size="small"
          type="primary"
          @click="openCreate"
        >
          创建支付批次
        </AButton>
      </template>
      <template #total="{ row }">
        {{ row.totalCount }} 笔 · {{ row.totalAmount }}
        {{ row.currency }}
      </template>
      <template #paymentRoute="{ row }">
        <div
          class="grid min-h-[68px] grid-cols-[48px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="blue">账号</ATag>
          <span class="truncate">
            {{
              paymentRoute(row.paymentAccountId, row.paymentAccountChannelId)
                .accountName
            }}
          </span>
          <ATag class="m-0 text-center" color="green">通道</ATag>
          <span class="truncate">
            {{
              paymentRoute(row.paymentAccountId, row.paymentAccountChannelId)
                .channelName
            }}
          </span>
        </div>
      </template>
      <template #progress="{ row }">
        成功 {{ row.successCount }} / 失败 {{ row.failedCount }} / 未知
        {{ row.unknownCount }}
      </template>
      <template #status="{ row }">
        <ATag :color="businessStateColor(row.status)">
          {{ businessEnumText(row.status) }}
        </ATag>
      </template>
      <template #orderTime="{ row }">
        <OrderTimeCell
          :created-at="row.createdAt"
          :ended-at="resolveBusinessEndTime(row.status, row.updatedAt)"
        />
      </template>
      <template #action="{ row }">
        <div
          class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
        >
          <AButton
            class="px-1"
            size="small"
            type="link"
            @click="openDetail(row)"
          >
            详情
          </AButton>
          <AButton
            v-access:code="['payment:batch:submit']"
            class="px-1"
            :disabled="row.status !== 'READY'"
            size="small"
            type="link"
            @click="submitBatch(row)"
          >
            提交
          </AButton>
          <AButton
            v-access:code="['payment:batch:retry']"
            class="px-1"
            :disabled="!['PROCESSING', 'UNKNOWN'].includes(row.status)"
            size="small"
            type="link"
            @click="reconcileBatch(row)"
          >
            回查
          </AButton>
        </div>
      </template>
    </Grid>
    <FormModalRender />

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
            {{
              paymentRoute(
                detail.batch.paymentAccountId,
                detail.batch.paymentAccountChannelId,
              ).accountName
            }}
            ·
            {{
              paymentRoute(
                detail.batch.paymentAccountId,
                detail.batch.paymentAccountChannelId,
              ).channelName
            }}
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
            key="paymentOrder"
            title="支付订单 / 收款账号"
            :width="300"
          >
            <template #default="{ record }">
              <div>{{ record.paymentNo }}</div>
              <div
                class="mt-1 grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-left"
              >
                <ATag class="m-0 text-center" color="blue">姓名</ATag>
                <span class="truncate">{{ record.payeeName }}</span>
                <ATag class="m-0 text-center" color="cyan">账号</ATag>
                <span class="truncate">{{ record.payeeIdentity }}</span>
              </div>
            </template>
          </ATableColumn>
          <ATableColumn data-index="amount" title="金额" :width="100" />
          <ATableColumn key="status" title="状态" :width="120">
            <template #default="{ record }">
              {{ businessEnumText(record.status) }}
            </template>
          </ATableColumn>
          <ATableColumn data-index="errorMessage" title="结果说明">
            <template #default="{ text }">
              {{ text || '-' }}
            </template>
          </ATableColumn>
        </ATable>
      </template>
    </ADrawer>
  </Page>
</template>
