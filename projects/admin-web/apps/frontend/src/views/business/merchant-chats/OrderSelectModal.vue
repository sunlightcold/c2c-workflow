<script setup lang="ts">
import type { MerchantChatApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { getMerchantChatOrdersApi } from '#/api';
import { BaseModal } from '#/components/base-modal';
import { useResourceGrid } from '#/hooks';

import { businessModalProps } from '../shared/business-form-layout';
import { businessEnumText, formatBusinessTime } from '../shared/business-ui';

const props = defineProps<{
  creating: boolean;
  merchantId?: string;
  merchants: MerchantChatApi.Merchant[];
  open: boolean;
  tenantId: string;
}>();
const emit = defineEmits<{
  close: [];
  select: [order: MerchantChatApi.Order];
}>();
const selected = ref<MerchantChatApi.Order>();
const visible = computed({
  get: () => props.open,
  set: (open) => {
    if (!open) emit('close');
  },
});
type SearchValues = {
  counterpartyName?: string;
  merchantId?: string;
  platformOrderId?: string;
  status?: string;
};
const [Grid, gridApi] = useResourceGrid<MerchantChatApi.Order, SearchValues>({
  formOptions: {
    commonConfig: { labelWidth: 80 },
    showCollapseButton: false,
    wrapperClass: 'grid-cols-1 md:grid-cols-2',
    schema: [
      {
        fieldName: 'merchantId',
        label: '商家账号',
        component: 'Select',
        componentProps: () => ({
          allowClear: true,
          showSearch: true,
          optionFilterProp: 'label',
          placeholder: '全部币安商家',
          options: props.merchants
            .filter((m) => m.platform === 'BINANCE' && m.status !== 'DISABLED')
            .map((m) => ({ label: m.name, value: m.merchantId })),
        }),
      },
      {
        fieldName: 'platformOrderId',
        label: '平台订单号',
        component: 'Input',
        componentProps: { allowClear: true, placeholder: '输入订单号' },
      },
      {
        fieldName: 'counterpartyName',
        label: '对方姓名',
        component: 'Input',
        componentProps: { allowClear: true, placeholder: '输入姓名' },
      },
      {
        fieldName: 'status',
        label: '商家订单状态',
        component: 'Select',
        componentProps: {
          allowClear: true,
          placeholder: '全部活动状态',
          options: [
            'NEW',
            'PENDING_PAYMENT',
            'PAYMENT_PROCESSING',
            'PAID_PENDING_PLATFORM_CONFIRM',
            'PENDING_RELEASE',
            'DISPUTED',
            'FUNDS_EXCEPTION',
            'EXCEPTION',
          ].map((value) => ({ label: businessEnumText(value), value })),
        },
      },
    ],
  },
  gridOptions: {
    height: 'auto',
    rowConfig: { keyField: 'id' },
    proxyConfig: {
      autoLoad: false,
      response: { result: 'items', total: 'total' },
    },
    toolbarConfig: {
      custom: false,
      export: false,
      refresh: false,
      resizable: false,
      search: false,
      zoom: false,
    },
    columns: [
      {
        field: 'selection',
        title: '选择',
        width: 60,
        fixed: 'left',
        slots: { default: 'selection' },
      },
      { field: 'platformOrderId', title: '平台订单号', minWidth: 220 },
      { field: 'merchantName', title: '商家账号', minWidth: 160 },
      { field: 'counterpartyName', title: '对方姓名', width: 120 },
      {
        field: 'status',
        title: '商家订单状态',
        width: 140,
        formatter: ({ cellValue }) => businessEnumText(cellValue),
      },
      {
        field: 'fiatAmount',
        title: '金额',
        width: 130,
        slots: { default: 'amount' },
      },
      {
        field: 'platformCreatedAt',
        title: '下单时间',
        width: 180,
        formatter: ({ cellValue }) => formatBusinessTime(cellValue),
      },
    ],
  },
  query: (params) => {
    selected.value = undefined;
    return getMerchantChatOrdersApi({
      tenantId: props.tenantId,
      merchantId: params.merchantId,
      platformOrderId: params.platformOrderId,
      counterpartyName: params.counterpartyName,
      status: params.status,
      page: params.pageIndex,
      pageSize: params.pageSize,
    });
  },
});
onMounted(async () => {
  await gridApi.formApi.setFieldValue('merchantId', props.merchantId);
  await gridApi.query();
});
</script>

<template>
  <BaseModal
    v-model="visible"
    v-bind="businessModalProps('新增会话', 1000)"
    :body-style="{
      height: 'min(760px, calc(100dvh - 180px))',
      overflow: 'hidden',
    }"
    :confirm-loading="creating"
    :ok-button-props="{ disabled: !selected }"
    :cancel-button-props="{ disabled: creating }"
    :closable="!creating"
    :keyboard="!creating"
    ok-text="生成会话"
    @ok="selected && emit('select', selected)"
  >
    <Grid class="min-h-0">
      <template #selection="{ row }">
        <ARadio
          :checked="selected?.id === row.id"
          :disabled="creating"
          :aria-label="`选择订单 ${row.platformOrderId}`"
          @change="selected = row"
        />
      </template>
      <template #amount="{ row }">
        {{ row.fiatAmount }} {{ row.fiatCurrency }}
      </template>
    </Grid>
  </BaseModal>
</template>
