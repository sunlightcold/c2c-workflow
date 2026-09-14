<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { TaskApi } from '#/api';

import { Page } from '@vben/common-ui';

import {
  createTaskApi,
  filterTasksApi,
  onceTaskApi,
  removeTaskApi,
  startTaskApi,
  stopTaskApi,
  updateTaskApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import { CommonStatusOptions } from '#/constants';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';
import { VxeUtils } from '#/utils';

import { createModalOptions, editModalOptions } from './schema';

interface RowType extends TaskApi.TaskData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'name',
      label: '任务名称',
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        options: CommonStatusOptions,
      },
    },
    {
      component: 'Select',
      fieldName: 'type',
      label: '任务类型',
      componentProps: {
        options: [
          { label: 'Cron表达式', value: 'Cron' },
          { label: '定时器', value: 'Interval' },
        ],
      },
    },
    {
      component: 'Select',
      fieldName: 'source',
      label: '任务来源',
      componentProps: {
        options: [
          { label: '自定义', value: 'custom' },
          { label: '系统', value: 'system' },
        ],
      },
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: '描述',
    },
  ],
  // 控制表单是否显示折叠按钮
  showCollapseButton: true,
  // 是否在字段值改变时提交表单
  submitOnChange: false,
  // 按下回车时是否提交表单
  submitOnEnter: true,
};

const gridOptions: VxeTableGridOptions<RowType> = {
  columns: [
    { type: 'seq', width: 70 },
    { field: 'name', title: '任务名称', width: 200 },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 110,
    },
    VxeUtils.tag.getColumn({
      column: { field: 'type', title: '类型', width: 200 },
      colorMap: { Cron: 'blue', Interval: 'green' },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'source', title: '来源', width: 120 },
      cellValueMap: { custom: '自定义', system: '系统' },
      colorMap: { custom: 'blue', system: 'orange' },
    }),
    { field: 'service', title: '调用服务', width: 200 },
    { field: 'data', title: '执行参数' },
    { field: 'description', title: '描述' },
    {
      field: 'startedAt',
      title: '开始时间',
      width: 200,
      formatter: 'formatDateTime',
    },
    {
      field: 'endedAt',
      title: '结束时间',
      width: 200,
      formatter: 'formatDateTime',
    },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 260,
      slots: { default: 'action' },
    },
  ],
};

const [Grid, gApi] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterTasksApi,
});
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function onCreateClick() {
  formModalShow(createModalOptions, {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as TaskApi.TaskData;
        await runResourceAction({
          action: () => createTaskApi(data),
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
        const data = api.formData() as TaskApi.TaskData;
        await runResourceAction({
          action: () => updateTaskApi(row.id, data),
          onSuccess: async () => {
            await gApi.query();
            formModalClose();
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
    action: () => removeTaskApi(row.id),
    onSuccess: () => gApi.query(),
    successMessage: '删除成功',
    title: '确认删除吗?',
  });
}

function onOnce(row: RowType) {
  confirmResourceAction({
    action: () => onceTaskApi(row.id),
    onSuccess: () => gApi.query(),
    successMessage: '立即执行成功',
    title: '确认立即执行一次吗?',
  });
}

function changeStatus(row: RowType, checked: boolean) {
  return runResourceAction({
    action: () => (checked ? startTaskApi(row.id) : stopTaskApi(row.id)),
    onSuccess: () => gApi.query(),
    successMessage: checked ? '启动成功' : '停止成功',
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['monitor:task:create']"
          size="small"
          type="primary"
          @click="onCreateClick"
        >
          新增
        </AButton>
      </template>
      <template #status="{ row }">
        <AsyncStatusSwitch
          v-access:code="[
            row.status === 1 ? 'monitor:task:stop' : 'monitor:task:start',
          ]"
          :checked="row.status === 1"
          checked-label="运行"
          :disabled="row.source === 'system'"
          :label="`${row.name}运行状态`"
          :request="(checked) => changeStatus(row, checked)"
          unchecked-label="停止"
        />
      </template>
      <template #action="{ row }">
        <ASpace :size="12" wrap>
          <AButton
            v-access:code="['monitor:task:once']"
            size="small"
            type="link"
            :disabled="row.source === 'system'"
            @click="onOnce(row)"
          >
            立即执行
          </AButton>
          <AButton
            v-access:code="['monitor:task:update']"
            size="small"
            type="link"
            :disabled="row.source === 'system'"
            @click="onEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['monitor:task:delete']"
            size="small"
            danger
            :disabled="row.source === 'system'"
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
