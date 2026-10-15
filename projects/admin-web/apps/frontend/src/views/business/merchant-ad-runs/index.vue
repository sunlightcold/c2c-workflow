<script setup lang="ts">
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { MerchantAdsApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { getMerchantAdRunApi, getMerchantAdRunsApi } from '#/api';
import { useResourceGrid } from '#/hooks';

import {
  adPriceText,
  adRunStatusLabels,
  adRunTriggerLabels,
} from '../shared/ad-ui';
import AdRunDetail from '../shared/AdRunDetail.vue';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { useAdMerchantFilter } from '../shared/use-ad-merchant-filter';

type SearchValues = { adId?: string; merchantId?: string; tenantId?: string };
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };
const {
  fixedTenantId,
  loadMerchants,
  loadTenantOptions,
  merchantOptions,
  selectedTenantId,
  tenantOptions,
} = useAdMerchantFilter();
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<MerchantAdsApi.Run>();
const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => void selectTenant(value),
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
      label: '商家账号',
    },
  ],
  wrapperClass: 'xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};
const gridOptions: VxeTableGridOptions<MerchantAdsApi.Run> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'merchantName', title: '商家账号', width: 220 },
    {
      field: 'platform',
      formatter: ({ cellValue }) => merchantPlatformText(cellValue),
      title: '交易平台',
      width: 100,
    },
    { field: 'platformAdId', title: '平台广告号', width: 225 },
    {
      field: 'trigger',
      formatter: ({ cellValue }) =>
        adRunTriggerLabels[cellValue as MerchantAdsApi.Run['trigger']],
      title: '运行方式',
      width: 110,
    },
    {
      field: 'status',
      formatter: ({ cellValue }) =>
        adRunStatusLabels[cellValue as MerchantAdsApi.RunStatus],
      title: '结果',
      width: 110,
    },
    {
      align: 'right',
      field: 'currentPrice',
      formatter: ({ cellValue }) => adPriceText(cellValue),
      title: '原价',
      width: 120,
    },
    {
      align: 'right',
      field: 'targetPrice',
      formatter: ({ cellValue }) => adPriceText(cellValue),
      title: '建议价',
      width: 120,
    },
    {
      align: 'right',
      field: 'actualPrice',
      formatter: ({ cellValue }) => adPriceText(cellValue),
      title: '回查实际价',
      width: 120,
    },
    { field: 'reason', minWidth: 260, title: '原因' },
    {
      field: 'createdAt',
      formatter: ({ cellValue }) => formatBusinessTime(cellValue),
      title: '运行时间',
      width: 180,
    },
    {
      field: 'action',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 85,
    },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  MerchantAdsApi.Run,
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
  query: (params) => {
    const tenantId = params.tenantId ?? selectedTenantId.value;
    return tenantId
      ? getMerchantAdRunsApi({
          tenantId,
          merchantId: params.merchantId,
          adId: params.adId,
          page: params.pageIndex,
          pageSize: params.pageSize,
        })
      : Promise.resolve(
          createEmptyBusinessPage(params.pageIndex, params.pageSize),
        );
  },
});

async function selectTenant(tenantId: string) {
  await gridApi.formApi.setFieldValue('merchantId', undefined);
  await loadMerchants(tenantId);
  await gridApi.query();
}

async function openDetail(run: MerchantAdsApi.Run) {
  detail.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getMerchantAdRunApi(run.id, {
      merchantId: run.merchantId,
      tenantId: run.tenantId,
    });
  } finally {
    detailLoading.value = false;
  }
}

onMounted(async () => {
  const tenantId = await loadTenantOptions();
  if (!tenantId) return;
  await gridApi.formApi.setFieldValue('tenantId', tenantId);
  await loadMerchants(tenantId);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <p class="text-muted-foreground text-sm">
          试算、自动和立即调价使用同一策略；待核实不代表已生效
        </p>
      </template>
      <template #action="{ row }">
        <AButton
          v-access:code="['merchant:adRun:read']"
          size="small"
          type="link"
          @click="openDetail(row)"
        >
          详情
        </AButton>
      </template>
    </Grid>
    <ADrawer
      v-model:open="detailOpen"
      title="调价记录详情"
      width="min(820px, 94vw)"
    >
      <ASpin :spinning="detailLoading">
        <AdRunDetail v-if="detail" :run="detail" />
      </ASpin>
    </ADrawer>
  </Page>
</template>
