<script lang="tsx" setup>
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';
import type { FormModalOptions } from '#/hooks';

import { Page } from '@vben/common-ui';

import { createTenantApi, getTenantsApi, setTenantStatusApi } from '#/api';
import { AsyncStatusSwitch } from '#/components';
import { runResourceAction, useFormModal, useResourceGrid } from '#/hooks';

import {
  businessFormOption,
  businessModalProps,
  layoutBusinessFormRules,
} from '../shared/business-form-layout';
import { formatBusinessTime, toBusinessGridData } from '../shared/business-ui';

const gridOptions: VxeTableGridOptions<BusinessApi.Tenant> = {
  columns: [
    { type: 'seq', width: 70 },
    { field: 'name', title: '单位名称', minWidth: 180 },
    { field: 'type', title: '类型', width: 130, slots: { default: 'type' } },
    {
      field: 'status',
      title: '状态',
      width: 150,
      slots: { default: 'status' },
    },
    {
      field: 'createdAt',
      title: '创建时间',
      width: 190,
      formatter: ({ cellValue }) => formatBusinessTime(cellValue as string),
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
  props: businessModalProps('新增代理商', 520),
  formProps: {
    option: businessFormOption,
    rule: layoutBusinessFormRules(
      [
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
      ],
      ['name'],
    ),
  },
};

function onCreateClick() {
  formModalShow(createModalOptions, {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as Pick<BusinessApi.Tenant, 'name'>;
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

async function changeStatus(tenant: BusinessApi.Tenant, checked: boolean) {
  const status = checked ? 'active' : 'disabled';
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
        <ASpace :size="8">
          <AsyncStatusSwitch
            v-access:code="['agency:tenant:update']"
            :checked="row.status === 'active'"
            :disabled="row.systemLocked"
            :label="`${row.name}状态`"
            :request="(checked) => changeStatus(row, checked)"
          />
          <span v-if="row.systemLocked" class="text-muted-foreground text-xs">
            系统固定
          </span>
        </ASpace>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
