<script lang="tsx" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';
import type { FormModalOptions } from '#/hooks';

import { Page } from '@vben/common-ui';

import { createTenantApi, getTenantsApi, setTenantStatusApi } from '#/api';
import { runResourceAction, useFormModal, useResourceGrid } from '#/hooks';

import {
  businessStatusText,
  formatBusinessTime,
  toBusinessGridData,
} from '../shared/business-ui';

const gridOptions: VxeTableGridOptions<BusinessApi.Tenant> = {
  columns: [
    { type: 'seq', width: 70 },
    { field: 'name', title: '单位名称', minWidth: 180 },
    { field: 'code', title: '单位编码', width: 160 },
    { field: 'type', title: '类型', width: 130, slots: { default: 'type' } },
    {
      field: 'status',
      title: '状态',
      width: 100,
      slots: { default: 'status' },
    },
    {
      field: 'createdAt',
      title: '创建时间',
      width: 190,
      formatter: ({ cellValue }) => formatBusinessTime(cellValue as string),
    },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 120,
      slots: { default: 'action' },
    },
  ],
  pagerConfig: { enabled: false },
  toolbarConfig: { search: false },
};

const [Grid, gApi] = useResourceGrid({
  gridOptions,
  query: async () => toBusinessGridData(await getTenantsApi()),
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

const createModalOptions: FormModalOptions = {
  props: { centered: true, title: '新增代理商' },
  formProps: {
    option: {
      appendValue: false,
      form: { layout: 'vertical' },
      submitBtn: false,
    },
    rule: [
      {
        field: 'name',
        props: { maxlength: 100, placeholder: '请输入代理商名称' },
        title: '代理商名称',
        type: 'input',
        validate: [
          { message: '请输入代理商名称', required: true, trigger: 'blur' },
        ],
        value: '',
      },
      {
        field: 'code',
        props: { maxlength: 32, placeholder: '请输入代理商编码' },
        title: '代理商编码',
        type: 'input',
        validate: [
          { message: '请输入代理商编码', required: true, trigger: 'blur' },
        ],
        value: '',
      },
    ],
  },
};

function onCreateClick() {
  formModalShow(createModalOptions, {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as Pick<BusinessApi.Tenant, 'code' | 'name'>;
      await runResourceAction({
        action: () => createTenantApi(data),
        onSuccess: async () => {
          formModalClose();
          await gApi.query();
        },
        successMessage: '代理商已创建',
      });
    },
  });
}

async function toggleStatus(tenant: BusinessApi.Tenant) {
  const status = tenant.status === 'active' ? 'disabled' : 'active';
  await runResourceAction({
    action: () => setTenantStatusApi(tenant.id, status),
    onSuccess: () => gApi.query(),
    successMessage: status === 'active' ? '所属单位已启用' : '所属单位已停用',
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['agency:tenant:create']"
          size="small"
          type="primary"
          @click="onCreateClick"
        >
          新增代理商
        </AButton>
      </template>
      <template #type="{ row }">
        {{ row.type === 'HEADQUARTERS_SELF' ? '总部自营' : '代理商' }}
      </template>
      <template #status="{ row }">
        <ATag :color="row.status === 'active' ? 'success' : 'default'">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #action="{ row }">
        <AButton
          v-if="!row.systemLocked"
          v-access:code="['agency:tenant:update']"
          size="small"
          type="default"
          @click="toggleStatus(row)"
        >
          {{ row.status === 'active' ? '停用' : '启用' }}
        </AButton>
        <span v-else class="text-muted-foreground">系统固定</span>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
