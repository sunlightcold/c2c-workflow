<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { getTelegramSuperAdminsApi } from '#/api';
import { useResourceGrid } from '#/hooks';

import {
  businessEnumText,
  businessStatusColor,
  businessStatusText,
} from '../shared/business-ui';
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
        onChange: (value: string) => {
          selectedTenantId.value = value;
          void gridApi.query();
        },
      }),
    },
    {
      component: 'Input',
      fieldName: 'telegramUserId',
      label: 'Telegram 用户 ID',
    },
    {
      component: 'Select',
      fieldName: 'scopeType',
      label: '权限范围',
      componentProps: {
        options: [
          { label: '全部群组', value: 'ALL_GROUPS' },
          { label: '指定群组', value: 'SPECIFIED_GROUPS' },
        ],
        allowClear: true,
      },
    },
  ],
};
const gridOptions: VxeTableGridOptions<BusinessApi.TelegramSuperAdmin> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'telegramUserId', title: 'Telegram 用户 ID', width: 190 },
    { field: 'userId', title: '后台用户 ID', width: 120 },
    {
      field: 'scopeType',
      title: '权限范围',
      formatter: ({ cellValue }) => businessEnumText(cellValue as string),
      width: 130,
    },
    {
      field: 'groupIds',
      title: '指定群组',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 个`,
      width: 110,
    },
    { field: 'status', title: '状态', slots: { default: 'status' }, width: 90 },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramSuperAdmin,
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
    getTelegramSuperAdminsApi({
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
      <template #status="{ row }">
        <ATag :color="businessStatusColor(row.status)">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
    </Grid>
  </Page>
</template>
