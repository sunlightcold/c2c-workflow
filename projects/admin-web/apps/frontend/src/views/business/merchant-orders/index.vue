<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { notification } from 'ant-design-vue';

import {
  cancelMerchantOrderApi,
  confirmMerchantOrderPaidApi,
  createMerchantOrderPaymentApi,
  getMerchantOrderApi,
  getMerchantOrderAppealReasonsApi,
  getMerchantOrdersApi,
  getMerchantOrderStatisticsApi,
  getMerchantsApi,
  getPaymentAccountsApi,
  submitMerchantOrderAppealApi,
  syncMerchantOrdersApi,
} from '#/api';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import {
  cancelMerchantOrderModalOptions,
  createMerchantOrderAppealModalOptions,
} from '../shared/business-form-schemas';
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
import { createOrderStatisticItems } from '../shared/high-card-statistics';
import HighCardStatistics from '../shared/HighCardStatistics.vue';
import { merchantOrderReviewReason } from '../shared/merchant-order-review';
import OrderTimeCell from '../shared/OrderTimeCell.vue';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

type SearchValues = {
  createdAt?: unknown;
  endTime?: string;
  merchantId?: string;
  paymentMethod?: 'ALIPAY';
  platformOrderId?: string;
  startTime?: string;
  status?: string;
  tenantId?: string;
};
type QueryParams = Omit<BusinessApi.MerchantOrderQuery, 'page'> & {
  createdAt?: unknown;
  pageIndex: number;
};

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const merchantOptions = reactive<
  Array<{
    disabled?: boolean;
    label: string;
    value: string;
  }>
>([]);
const merchants = ref<BusinessApi.Merchant[]>([]);
const paymentAccounts = ref<BusinessApi.PaymentAccount[]>([]);
const selectedTenantId = ref('');
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<BusinessApi.MerchantOrderDetail>();
const actionLoading = ref('');
const statistics = ref<BusinessApi.OrderStatistics>();

const statisticItems = computed(() =>
  createOrderStatisticItems(statistics.value),
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

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  fieldMappingTime: [
    ['createdAt', ['startTime', 'endTime'], 'YYYY-MM-DDTHH:mm:ssZ'],
  ],
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
        allowClear: false,
        options: merchantOptions,
        placeholder: '请选择商家账号',
        showSearch: true,
      }),
      fieldName: 'merchantId',
      label: '商家账号',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入平台订单号' },
      fieldName: 'platformOrderId',
      label: '平台订单号',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: statusOptions,
        placeholder: '全部状态',
      },
      fieldName: 'status',
      label: '订单状态',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [{ label: '支付宝', value: 'ALIPAY' }],
        placeholder: '全部方式',
      },
      fieldName: 'paymentMethod',
      label: '支付方式',
    },
    {
      component: 'RangePicker',
      componentProps: { showTime: true },
      fieldName: 'createdAt',
      label: '订单时间',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.MerchantOrder> = {
  cellConfig: { height: 75 },
  columnConfig: { resizable: true },
  columns: [
    { type: 'seq', width: 60 },
    { field: 'platformOrderId', minWidth: 190, title: '平台订单号' },
    {
      field: 'platform',
      formatter: ({ cellValue }) =>
        merchantPlatformText(cellValue as BusinessApi.MerchantPlatform),
      title: '平台',
      width: 90,
    },
    {
      align: 'right',
      field: 'fiatAmount',
      slots: { default: 'amount' },
      title: '订单金额',
      width: 140,
    },
    {
      field: 'payee',
      minWidth: 215,
      slots: { default: 'payee' },
      title: '收款信息',
    },
    {
      field: 'paymentRoute',
      minWidth: 230,
      slots: { default: 'paymentRoute' },
      title: '转账账号 / 通道',
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '订单状态',
      width: 145,
    },
    {
      field: 'paymentStatus',
      slots: { default: 'paymentStatus' },
      title: '支付状态',
      width: 145,
    },
    {
      field: 'orderTime',
      slots: { default: 'orderTime' },
      title: '订单时间',
      width: 215,
    },
    {
      align: 'center',
      field: 'active',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 320,
    },
  ],
  showOverflow: true,
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.MerchantOrder,
  SearchValues,
  QueryParams
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    merchantId: formValues.merchantId || undefined,
    pageIndex: page.currentPage,
    pageSize: page.pageSize,
  }),
  query: async (params) => {
    selectedTenantId.value = params.tenantId ?? '';
    if (!params.tenantId) {
      statistics.value = undefined;
      return createEmptyBusinessPage(params.pageIndex, params.pageSize);
    }
    const { createdAt: _createdAt, pageIndex, ...query } = params;
    const [page, nextStatistics] = await Promise.all([
      getMerchantOrdersApi({ ...query, page: pageIndex }),
      getMerchantOrderStatisticsApi({
        merchantId: query.merchantId,
        paymentMethod: query.paymentMethod,
        platformOrderId: query.platformOrderId,
        tenantId: query.tenantId,
      }),
    ]);
    statistics.value = nextStatistics;
    return page;
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string, refresh: boolean) {
  selectedTenantId.value = tenantId;
  await gridApi.formApi.setFieldValue('tenantId', tenantId);
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
  await gridApi.formApi.setFieldValue('merchantId', undefined);
  gridApi.formApi.setLatestSubmissionValues(
    (await gridApi.formApi.getValues()) as SearchValues,
  );
  if (refresh) await gridApi.query();
}

async function syncOrders() {
  const values = (await gridApi.formApi.getValues()) as SearchValues;
  if (!values.merchantId || !selectedTenantId.value) return;
  actionLoading.value = `sync:${values.merchantId}`;
  try {
    await runResourceAction({
      action: () =>
        syncMerchantOrdersApi(values.merchantId!, {
          tenantId: selectedTenantId.value,
        }),
      onSuccess: () => gridApi.query(),
      successMessage: '商家订单同步完成',
    });
  } finally {
    actionLoading.value = '';
  }
}

async function openDetail(order: BusinessApi.MerchantOrder) {
  detail.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getMerchantOrderApi(order.id, {
      merchantId: order.merchantId,
      tenantId: selectedTenantId.value,
    });
  } finally {
    detailLoading.value = false;
  }
}

function createPayment(order: BusinessApi.MerchantOrder) {
  confirmResourceAction({
    action: async () => {
      const payment = await createMerchantOrderPaymentApi(order.id, {
        merchantId: order.merchantId,
        tenantId: selectedTenantId.value,
      });
      if (['FAILED', 'FUND_EXCEPTION'].includes(payment.status)) {
        notification.error({
          description: payment.lastError || '请进入支付订单查看失败原因',
          message: '支付失败',
        });
        return;
      }
      notification.success({
        message:
          payment.executionMode === 'BATCH'
            ? '支付订单已创建，等待批次策略提交'
            : '支付宝商家转账已提交',
      });
    },
    content: '系统将按照该商家的启用支付方案选择支付账号和支付通道。',
    okText: '支付',
    onSuccess: () => gridApi.query(),
    title: '确认支付该订单吗？',
  });
}

function confirmPaid(order: BusinessApi.MerchantOrder) {
  confirmResourceAction({
    action: () =>
      confirmMerchantOrderPaidApi(order.id, {
        merchantId: order.merchantId,
        tenantId: selectedTenantId.value,
      }),
    content: '系统只会重试交易平台付款确认，不会再次发起支付宝支付。',
    okText: '确认重试',
    onSuccess: () => gridApi.query(),
    successMessage: '交易平台付款确认已完成',
    title: '重试付款确认',
  });
}

function cancelOrder(order: BusinessApi.MerchantOrder) {
  formModalShow(cancelMerchantOrderModalOptions(), {
    onOk: async (api) => {
      await api.validate();
      const { reason } = api.formData() as { reason: string };
      await runResourceAction({
        action: () =>
          cancelMerchantOrderApi(order.id, {
            merchantId: order.merchantId,
            reason,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '商家订单已作废',
      });
    },
  });
}

async function appealOrder(order: BusinessApi.MerchantOrder) {
  actionLoading.value = `appeal:${order.id}`;
  try {
    const { reasons } = await getMerchantOrderAppealReasonsApi(order.id, {
      merchantId: order.merchantId,
      tenantId: selectedTenantId.value,
    });
    formModalShow(createMerchantOrderAppealModalOptions(reasons), {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as {
          reasonCode: number;
        };
        await runResourceAction({
          action: () =>
            submitMerchantOrderAppealApi(order.id, {
              merchantId: order.merchantId,
              reasonCode: Number(data.reasonCode),
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '订单申诉已提交',
        });
      },
    });
  } finally {
    actionLoading.value = '';
  }
}

function canPay(order: BusinessApi.MerchantOrder) {
  return (
    order.status === 'PENDING_PAYMENT' &&
    order.payable &&
    order.identityMatched &&
    order.paymentMethod === 'ALIPAY' &&
    !order.paymentOrder
  );
}

function canCancel(order: BusinessApi.MerchantOrder) {
  return (
    order.status === 'PENDING_PAYMENT' &&
    (!order.paymentOrder ||
      ['CREATED', 'PENDING_CONFIG', 'READY'].includes(
        order.paymentOrder.status,
      ))
  );
}

function canConfirm(order: BusinessApi.MerchantOrder) {
  return (
    order.paymentOrder?.status === 'SUCCESS' &&
    order.paymentOrder.platformConfirmStatus === 'FAILED'
  );
}

function canAppeal(order: BusinessApi.MerchantOrder) {
  return (
    order.platform === 'BINANCE' &&
    order.status === 'PENDING_RELEASE' &&
    order.paymentOrder?.status === 'SUCCESS' &&
    order.paymentOrder.platformConfirmStatus === 'SUCCESS' &&
    !order.appealStatus
  );
}

function paymentRoute(order: BusinessApi.MerchantOrder) {
  const payment = order.paymentOrder;
  return resolvePaymentRoute(
    paymentAccounts.value,
    payment?.paymentAccountId,
    payment?.paymentAccountChannelId,
  );
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (!selectedTenantId.value) return;
  await selectTenant(selectedTenantId.value, false);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #top>
        <HighCardStatistics :items="statisticItems" class="pb-2" />
      </template>
      <template #toolbar-actions>
        <AButton
          v-access:code="['merchant:order:sync']"
          :disabled="merchantOptions.length === 0"
          :loading="actionLoading.startsWith('sync:')"
          size="small"
          type="primary"
          @click="syncOrders"
        >
          同步订单
        </AButton>
      </template>
      <template #amount="{ row }">
        <span class="tabular-nums">{{ row.fiatAmount }}</span>
        {{ row.fiatCurrency }}
      </template>
      <template #payee="{ row }">
        <div
          class="grid min-h-[68px] grid-cols-[48px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="blue">姓名</ATag>
          <span class="truncate">{{ row.payeeName || '-' }}</span>
          <ATag class="m-0 text-center" color="cyan">账号</ATag>
          <span class="truncate">{{ row.payeeIdentity || '-' }}</span>
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
      <template #paymentStatus="{ row }">
        <ATag
          v-if="row.paymentOrder"
          :color="businessStateColor(row.paymentOrder.status)"
        >
          {{ businessEnumText(row.paymentOrder.status) }}
        </ATag>
        <span v-else class="text-muted-foreground">未创建</span>
      </template>
      <template #orderTime="{ row }">
        <OrderTimeCell
          :created-at="row.platformCreatedAt"
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
            v-access:code="['merchant:order:pay']"
            class="px-1"
            :disabled="!canPay(row)"
            size="small"
            type="primary"
            @click="createPayment(row)"
          >
            支付
          </AButton>
          <AButton
            v-access:code="['merchant:order:confirm_paid']"
            class="px-1"
            :disabled="!canConfirm(row)"
            size="small"
            type="primary"
            @click="confirmPaid(row)"
          >
            补偿确认
          </AButton>
          <AButton
            v-access:code="['merchant:order:appeal']"
            class="px-1"
            :disabled="!canAppeal(row)"
            :loading="actionLoading === `appeal:${row.id}`"
            size="small"
            type="link"
            @click="appealOrder(row)"
          >
            申诉
          </AButton>
          <AButton
            v-access:code="['merchant:order:cancel']"
            class="px-1"
            danger
            :disabled="!canCancel(row)"
            size="small"
            type="link"
            @click="cancelOrder(row)"
          >
            作废
          </AButton>
        </div>
      </template>
    </Grid>

    <ADrawer
      v-model:open="detailOpen"
      title="商家订单详情"
      width="min(780px, 94vw)"
    >
      <ASpin :spinning="detailLoading">
        <template v-if="detail">
          <AAlert
            v-if="merchantOrderReviewReason(detail)"
            class="mb-4"
            show-icon
            type="warning"
            message="未自动创建支付订单"
            :description="merchantOrderReviewReason(detail)"
          />
          <ADescriptions bordered :column="1" size="small">
            <ADescriptionsItem label="平台订单号">
              {{ detail.platformOrderId }}
            </ADescriptionsItem>
            <ADescriptionsItem label="交易平台">
              {{ merchantPlatformText(detail.platform) }}
            </ADescriptionsItem>
            <ADescriptionsItem label="订单金额">
              {{ detail.fiatAmount }} {{ detail.fiatCurrency }}
            </ADescriptionsItem>
            <ADescriptionsItem label="买入数量">
              {{ detail.assetAmount }} {{ detail.asset }}
            </ADescriptionsItem>
            <ADescriptionsItem label="收款人">
              {{ detail.payeeName || '-' }}
            </ADescriptionsItem>
            <ADescriptionsItem label="平台实名">
              {{ detail.identityName || '-' }}
            </ADescriptionsItem>
            <ADescriptionsItem label="实名核验">
              {{ detail.identityMatched ? '一致' : '不一致' }}
            </ADescriptionsItem>
            <ADescriptionsItem label="支付宝账号">
              {{ detail.payeeIdentity || '-' }}
            </ADescriptionsItem>
            <ADescriptionsItem label="转账账号 / 通道">
              {{ paymentRoute(detail).accountName }} ·
              {{ paymentRoute(detail).channelName }}
            </ADescriptionsItem>
            <ADescriptionsItem label="订单状态">
              {{ businessEnumText(detail.status) }}
            </ADescriptionsItem>
            <ADescriptionsItem label="支付单号">
              {{ detail.paymentOrder?.paymentNo || '-' }}
            </ADescriptionsItem>
            <ADescriptionsItem label="支付状态">
              {{ businessEnumText(detail.paymentOrder?.status) }}
            </ADescriptionsItem>
            <ADescriptionsItem
              v-if="
                detail.paymentOrder?.platformConfirmStatus !== 'NOT_REQUIRED'
              "
              label="平台确认状态"
            >
              {{
                platformConfirmationText(
                  detail.paymentOrder?.platformConfirmStatus,
                )
              }}
            </ADescriptionsItem>
            <ADescriptionsItem
              v-if="detail.paymentOrder?.platformConfirmLastError"
              label="平台确认异常"
            >
              {{ detail.paymentOrder.platformConfirmLastError }}
            </ADescriptionsItem>
            <ADescriptionsItem label="申诉状态">
              {{ businessEnumText(detail.appealStatus) }}
            </ADescriptionsItem>
            <ADescriptionsItem
              v-if="detail.appealComplaintNo"
              label="申诉追踪号"
            >
              {{ detail.appealComplaintNo }}
            </ADescriptionsItem>
            <ADescriptionsItem v-if="detail.lastError" label="订单异常">
              {{ detail.lastError }}
            </ADescriptionsItem>
            <ADescriptionsItem v-if="detail.appealLastError" label="申诉异常">
              {{ detail.appealLastError }}
            </ADescriptionsItem>
          </ADescriptions>

          <ADivider orientation="left">订单状态记录</ADivider>
          <ATimeline>
            <ATimelineItem v-for="item in detail.history" :key="item.id">
              <div class="font-medium">
                {{ businessEnumText(item.toStatus) }}
              </div>
              <div class="text-muted-foreground text-sm">
                {{ formatBusinessTime(item.createdAt) }} ·
                {{ businessEnumText(item.source) }}
              </div>
              <div v-if="item.reason" class="mt-1 text-sm">
                {{ item.reason }}
              </div>
            </ATimelineItem>
          </ATimeline>

          <template v-if="detail.paymentOrder?.history.length">
            <ADivider orientation="left">支付状态记录</ADivider>
            <ATimeline>
              <ATimelineItem
                v-for="item in detail.paymentOrder.history"
                :key="item.id"
              >
                <div class="font-medium">
                  {{ businessEnumText(item.toStatus) }}
                </div>
                <div class="text-muted-foreground text-sm">
                  {{ formatBusinessTime(item.createdAt) }} ·
                  {{ businessEnumText(item.source) }}
                </div>
                <div v-if="item.reason" class="mt-1 text-sm">
                  {{ item.reason }}
                </div>
              </ATimelineItem>
            </ATimeline>
          </template>
        </template>
      </ASpin>
    </ADrawer>
    <FormModalRender />
  </Page>
</template>
