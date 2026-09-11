<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { getTelegramMembersApi } from '#/api';
import { useResourceGrid } from '#/hooks';

import { businessStatusColor, businessStatusText } from '../shared/business-ui';
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
      fieldName: 'role',
      label: '角色',
      componentProps: {
        options: [
          { label: '群管理员', value: 'ADMIN' },
          { label: '操作员', value: 'OPERATOR' },
          { label: '只读', value: 'VIEWER' },
        ],
        allowClear: true,
      },
    },
  ],
};
const gridOptions: VxeTableGridOptions<BusinessApi.TelegramMember> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'telegramUserId', title: 'Telegram 用户 ID', width: 180 },
    { field: 'telegramUsername', title: '用户名', minWidth: 160 },
    { field: 'groupId', title: '群组 ID', minWidth: 220 },
    { field: 'role', title: '角色', width: 110 },
    {
      field: 'capabilities',
      title: '权限',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
      width: 100,
    },
    { field: 'status', title: '状态', slots: { default: 'status' }, width: 90 },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramMember,
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
    getTelegramMembersApi({
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
