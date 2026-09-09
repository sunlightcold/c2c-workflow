<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { ParamsApi } from '#/api';

import { Page } from '@vben/common-ui';

import {
  createParamsApi,
  filterParamsApi,
  removeParamsApi,
  updateParamsApi,
} from '#/api';
import {
  AntColorVar,
  ParamsTypeEnum,
  ParamsTypeMap,
  ParamsTypeOptions,
} from '#/constants';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';
import { VxeUtils } from '#/utils';

import { createModalOptions, editModalOptions } from './schema';

interface RowType extends ParamsApi.ParamsData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: '参数名称',
    },
    {
      component: 'Input',
      fieldName: 'key',
      label: '参数键名',
    },
    {
      component: 'Input',
      fieldName: 'value',
      label: '参数值',
    },
    {
      component: 'Select',
      fieldName: 'type',
      label: '参数类型',
      componentProps: {
        options: ParamsTypeOptions,
      },
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
    },
  ],
  // 控制表单是否显示折叠按钮
  showCollapseButton: false,
  // 是否在字段值改变时提交表单
  submitOnChange: false,
  // 按下回车时是否提交表单
  submitOnEnter: true,
};

const gridOptions: VxeTableGridOptions<RowType> = {
  columns: [
    { type: 'seq', width: 70 },
    { field: 'name', title: '参数名', width: 150 },
    { field: 'key', title: '参数键名', width: 200 },
    { field: 'value', title: '参数值' },
    VxeUtils.tag.getColumn({
      column: { field: 'type', title: '变量类型', width: 100 },
      cellValueMap: ParamsTypeMap,
      colorMap: {
        [ParamsTypeEnum.System]: AntColorVar.warning,
        [ParamsTypeEnum.Normal]: AntColorVar.primary,
      },
    }),
    { field: 'description', title: '描述' },
    {
      field: 'createdAt',
      title: '创建时间',
      width: 200,
      formatter: 'formatDateTime',
    },
    {
      field: 'updatedAt',
      title: '更新时间',
      width: 200,
      formatter: 'formatDateTime',
    },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 180,
      slots: { default: 'action' },
    },
  ],
};

const [Grid, gApi] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterParamsApi,
});
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function onCreateClick() {
  formModalShow(createModalOptions, {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as ParamsApi.ParamsData;
        await runResourceAction({
          action: () => createParamsApi(data),
          onSuccess: async () => {
            await gApi.query();
            formModalClose();
          },
          successMessage: '新增成功',
        });
      });
    },
  });
}

async function onEdit(row: RowType) {
  const [fApi] = await formModalShow(editModalOptions, {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as ParamsApi.ParamsData;
        await runResourceAction({
          action: () => updateParamsApi(row.id, data),
          onSuccess: async () => {
            formModalClose();
            await gApi.query();
          },
          successMessage: '修改成功',
        });
      });
    },
  });
  fApi?.setValue(row);
}

function onRemove(row: RowType) {
  confirmResourceAction({
    action: () => removeParamsApi(row.id),
    onSuccess: () => gApi.query(),
    successMessage: '删除成功',
    title: '确认删除吗?',
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['system:params:create']"
          size="small"
          type="primary"
          @click="onCreateClick"
        >
          新增
        </AButton>
      </template>
      <template #action="{ row }">
        <ASpace>
          <AButton
            v-access:code="['system:params:update']"
            size="small"
            type="default"
            @click="onEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['system:params:delete']"
            size="small"
            danger
            :disabled="row.type === ParamsTypeEnum.System"
            @click="onRemove(row)"
          >
            删除
          </AButton>
        </ASpace>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
