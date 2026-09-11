<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { getTelegramGroupsApi } from '#/api';
import { useResourceGrid } from '#/hooks';

import { businessEnumText, businessStateColor } from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadDefaultTenantId, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      fieldName: 'tenantId',
      label: '经营单位',
      componentProps: () => ({
        options: tenantOptions,
        disabled: Boolean(fixedTenantId.value),
        allowClear: false,
        showSearch: true,
        onChange: (value: string) => {
          selectedTenantId.value = value;
          void gridApi.query();
        },
      }),
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '群组名称',
      componentProps: { placeholder: '请输入群组名称' },
    },
    {
      component: 'Select',
      fieldName: 'bindingState',
      label: '绑定状态',
      componentProps: {
        options: [
          { label: '待验证', value: 'PENDING' },
          { label: '已绑定', value: 'ACTIVE' },
          { label: '已暂停', value: 'PAUSED' },
          { label: '已解绑', value: 'UNBOUND' },
        ],
        allowClear: true,
      },
    },
  ],
};
const gridOptions: VxeTableGridOptions<BusinessApi.TelegramGroup> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'name', title: '群组名称', minWidth: 180 },
    { field: 'chatId', title: 'Telegram Chat ID', minWidth: 170 },
    {
      field: 'paymentScene',
      title: '支付场景',
      formatter: ({ cellValue }) => businessEnumText(cellValue as string),
      width: 130,
    },
    {
      field: 'bindingState',
      title: '绑定状态',
      slots: { default: 'state' },
      width: 110,
    },
    {
      field: 'capabilities',
      title: '群组能力',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
      width: 110,
    },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramGroup,
  Record<string, unknown>,
  { pageIndex: number; pageSize: number }
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    page: page.currentPage,
    pageSize: page.pageSize,
    tenantId: selectedTenantId.value,
  }),
  query: (params) =>
    getTelegramGroupsApi({
      ...params,
      tenantId: selectedTenantId.value,
      page: params.page as number,
      pageSize: params.pageSize as number,
    }),
});
onMounted(async () => {
  selectedTenantId.value = (await loadDefaultTenantId()) || '';
  if (selectedTenantId.value) {
    await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
    await gridApi.query();
  }
});
</script>
<template>
  <Page auto-content-height>
    <Grid>
      <template #state="{ row }">
        <ATag :color="businessStateColor(row.bindingState)">
          {{ businessEnumText(row.bindingState) }}
        </ATag>
      </template>
    </Grid>
  </Page>
</template>
