<script lang="tsx" setup>
import type { PaymentOrderDetail } from './payment-order-detail';

import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createManualPaymentOrderApi,
  getMerchantsApi,
  getPaymentAccountsApi,
  getPaymentOrderApi,
  getPaymentOrdersApi,
  rematchPaymentOrderApi,
} from '#/api';
import { runResourceAction, useFormModal, useResourceGrid } from '#/hooks';

import { createManualPaymentModalOptions } from '../shared/business-form-schemas';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessEnumText,
  businessStateColor,
  formatBusinessTime,
  merchantPlatformText,
  platformConfirmationText,
  resolveBusinessEndTime,
  resolvePaymentRoute,
} from '../shared/business-ui';
import OrderTimeCell from '../shared/OrderTimeCell.vue';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';
import { queryPaymentOrderDetail } from './payment-order-detail';

type SearchValues = {
  merchantId?: string;
  orderNo?: string;
  sourceType?: BusinessApi.PaymentSourceType;
  status?: string;
  tenantId?: string;
};
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const merchants = ref<BusinessApi.Merchant[]>([]);
const paymentAccounts = ref<BusinessApi.PaymentAccount[]>([]);
const merchantOptions = reactive<Array<{ label: string; value: string }>>([]);
const detailOpen = ref(false);
const detail = ref<PaymentOrderDetail>();

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
  'FAILED',
  'CANCELLED',
  'FUND_EXCEPTION',
].map((value) => ({ label: businessEnumText(value), value }));

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 128,
        placeholder: '支付 / 系统 / 平台 / 批次订单号',
      },
      fieldName: 'orderNo',
      label: '订单号',
    },
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
        showSearch: true,
      }),
      fieldName: 'merchantId',
      label: '商家',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: sourceOptions,
        placeholder: '全部来源',
      },
      fieldName: 'sourceType',
      label: '来源',
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
  wrapperClass: '2xl:grid-cols-5 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.PaymentOrderListItem> = {
  cellConfig: { height: 96 },
  columns: [
    { type: 'seq', width: 70 },
    {
      field: 'orderNumbers',
      title: '订单号',
      minWidth: 280,
      slots: { default: 'orderNumbers' },
    },
    {
      field: 'batchNo',
      title: '批次号',
      minWidth: 190,
      slots: { default: 'batchNo' },
    },
    {
      field: 'sourceType',
      title: '来源',
      width: 140,
      formatter: ({ cellValue }) => businessEnumText(cellValue as string),
    },
    {
      field: 'amount',
      title: '支付金额',
      width: 130,
      slots: { default: 'amount' },
    },
    {
      field: 'executionMode',
      title: '付款模式',
      width: 120,
      formatter: ({ cellValue }) => businessEnumText(cellValue as string),
    },
    {
      field: 'paymentRoute',
      title: '转账账号 / 通道',
      minWidth: 230,
      slots: { default: 'paymentRoute' },
    },
    {
      field: 'payee',
      title: '收款信息',
      minWidth: 215,
      slots: { default: 'payee' },
    },
    {
      field: 'status',
      title: '支付状态',
      width: 150,
      slots: { default: 'status' },
    },
    {
      field: 'platformConfirmStatus',
      title: '平台确认',
      width: 130,
      formatter: ({ cellValue }) =>
        platformConfirmationText(cellValue as string),
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
      width: 190,
      slots: { default: 'action' },
    },
  ],
};

const [Grid, gApi] = useResourceGrid<
  BusinessApi.PaymentOrderListItem,
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
    return getPaymentOrdersApi({
      merchantId: params.merchantId,
      orderNo: params.orderNo,
      page: params.pageIndex,
      pageSize: params.pageSize,
      sourceType: params.sourceType,
      status: params.status,
      tenantId: params.tenantId,
    });
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string, refresh: boolean) {
  selectedTenantId.value = tenantId;
  await gApi.formApi.setFieldValue('tenantId', tenantId);
  [merchants.value, paymentAccounts.value] = tenantId
    ? await Promise.all([
        getMerchantsApi({ tenantId }),
        getPaymentAccountsApi({ tenantId }),
      ])
    : [[], []];
  merchantOptions.splice(
    0,
    merchantOptions.length,
    ...merchants.value.map((merchant) => ({
      disabled: merchant.status !== 'active',
      label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
      value: merchant.id,
    })),
  );
  await gApi.formApi.setFieldValue('merchantId', undefined);
  gApi.formApi.setLatestSubmissionValues(
    (await gApi.formApi.getValues()) as SearchValues,
  );
  if (refresh) await gApi.query();
}

function openCreate() {
  formModalShow(createManualPaymentModalOptions(merchantOptions), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as Omit<
        BusinessApi.ManualPaymentOrderInput,
        'currency' | 'paymentMethod'
      >;
      await runResourceAction({
        action: () =>
          createManualPaymentOrderApi({
            ...data,
            currency: 'CNY',
            paymentMethod: 'ALIPAY',
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gApi.reload();
        },
        successMessage: '支付订单已创建',
      });
    },
  });
}

async function openDetail(order: BusinessApi.PaymentOrder) {
  detail.value = await getPaymentOrderApi(order.id, {
    tenantId: selectedTenantId.value,
  });
  detailOpen.value = true;
}

async function queryUpstream(order: BusinessApi.PaymentOrder) {
  detail.value = await queryPaymentOrderDetail(
    order.id,
    selectedTenantId.value,
  );
  detailOpen.value = true;
  await gApi.query();
}

function paymentRoute(order: BusinessApi.PaymentOrder) {
  return resolvePaymentRoute(
    paymentAccounts.value,
    order.paymentAccountId,
    order.paymentAccountChannelId,
  );
}

async function runOrderAction(order: BusinessApi.PaymentOrder) {
  await runResourceAction({
    action: () =>
      rematchPaymentOrderApi(order.id, { tenantId: selectedTenantId.value }),
    onSuccess: () => gApi.query(),
    successMessage: '支付方案重新匹配完成',
  });
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
          v-access:code="['payment:order:create']"
          :disabled="merchants.length === 0"
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增手工支付
        </AButton>
      </template>
      <template #amount="{ row }">{{ row.amount }} {{ row.currency }}</template>
      <template #batchNo="{ row }">
        <span class="block truncate" :title="row.batchNo || '-'">
          {{ row.batchNo || '-' }}
        </span>
      </template>
      <template #orderNumbers="{ row }">
        <div
          class="grid min-h-[88px] grid-cols-[48px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="green">支付</ATag>
          <span class="truncate" :title="row.upstreamId || '-'">
            {{ row.upstreamId || '-' }}
          </span>
          <ATag class="m-0 text-center" color="blue">系统</ATag>
          <span class="truncate" :title="row.paymentNo">
            {{ row.paymentNo }}
          </span>
          <ATag class="m-0 text-center" color="orange">平台</ATag>
          <span class="truncate" :title="row.sourceBusinessNo">
            {{ row.sourceBusinessNo }}
          </span>
        </div>
      </template>
      <template #payee="{ row }">
        <div
          class="grid min-h-[68px] grid-cols-[48px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="blue">姓名</ATag>
          <span class="truncate">{{ row.payeeName }}</span>
          <ATag class="m-0 text-center" color="cyan">账号</ATag>
          <span class="truncate">{{ row.payeeIdentity }}</span>
        </div>
      </template>
      <template #paymentRoute="{ row }">
        <div
          class="grid min-h-[68px] grid-cols-[48px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="blue">账号</ATag>
          <span class="truncate">{{ paymentRoute(row).accountName }}</span>
          <ATag class="m-0 text-center" color="green">通道</ATag>
          <span class="truncate">{{ paymentRoute(row).channelName }}</span>
        </div>
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
            v-access:code="['payment:order:retry']"
            class="px-1"
            v-if="row.status === 'PENDING_CONFIG'"
            :disabled="row.status !== 'PENDING_CONFIG'"
            size="small"
            type="link"
            @click="runOrderAction(row)"
          >
            重新匹配
          </AButton>
          <AButton
            v-access:code="['payment:order:read']"
            class="px-1"
            v-if="row.status !== 'PENDING_CONFIG'"
            size="small"
            type="link"
            @click="queryUpstream(row)"
          >
            上游查询
          </AButton>
        </div>
      </template>
    </Grid>
    <FormModalRender />

    <ADrawer
      v-model:open="detailOpen"
      title="支付订单详情"
      width="min(760px, 94vw)"
    >
      <template v-if="detail">
        <ADescriptions bordered :column="1" size="small">
          <ADescriptionsItem label="支付订单号">
            {{ detail.upstreamId || '-' }}
          </ADescriptionsItem>
          <ADescriptionsItem label="系统订单号">
            {{ detail.paymentNo }}
          </ADescriptionsItem>
          <ADescriptionsItem label="平台订单号">
            {{ detail.sourceBusinessNo }}
          </ADescriptionsItem>
          <ADescriptionsItem label="金额">
            {{ detail.amount }} {{ detail.currency }}
          </ADescriptionsItem>
          <ADescriptionsItem label="收款信息">
            {{ detail.payeeName }} ·
            {{ detail.payeeIdentity }}
          </ADescriptionsItem>
          <ADescriptionsItem label="转账账号 / 通道">
            {{ paymentRoute(detail).accountName }} ·
            {{ paymentRoute(detail).channelName }}
          </ADescriptionsItem>
          <ADescriptionsItem label="执行方式">
            {{ businessEnumText(detail.executionMode) }}
          </ADescriptionsItem>
          <ADescriptionsItem label="支付状态">
            {{ businessEnumText(detail.status) }}
          </ADescriptionsItem>
          <ADescriptionsItem label="平台确认状态">
            {{ platformConfirmationText(detail.platformConfirmStatus) }}
          </ADescriptionsItem>
          <ADescriptionsItem
            v-if="detail.platformConfirmLastError"
            label="平台确认异常"
          >
            {{ detail.platformConfirmLastError }}
          </ADescriptionsItem>
          <ADescriptionsItem v-if="detail.upstream" label="上游查询状态">
            {{ businessEnumText(detail.upstream.status) }}
          </ADescriptionsItem>
          <ADescriptionsItem
            v-if="detail.upstream?.errorMessage"
            label="上游返回说明"
          >
            {{ detail.upstream.errorMessage }}
          </ADescriptionsItem>
          <ADescriptionsItem v-if="detail.lastError" label="异常原因">
            {{ detail.lastError }}
          </ADescriptionsItem>
        </ADescriptions>
        <template v-if="detail.upstream">
          <ADivider orientation="left">上游订单参数</ADivider>
          <pre class="bg-muted max-h-80 overflow-auto rounded p-3 text-xs">{{
            JSON.stringify(detail.upstream.raw, null, 2)
          }}</pre>
        </template>
        <ADivider orientation="left">状态时间线</ADivider>
        <ATimeline>
          <ATimelineItem v-for="item in detail.history" :key="item.id">
            <div class="font-medium">{{ businessEnumText(item.toStatus) }}</div>
            <div class="text-muted-foreground text-sm">
              {{ formatBusinessTime(item.createdAt) }} ·
              {{ businessEnumText(item.source) }}
            </div>
            <div v-if="item.reason" class="mt-1 text-sm">{{ item.reason }}</div>
          </ATimelineItem>
        </ATimeline>
      </template>
    </ADrawer>
  </Page>
</template>
