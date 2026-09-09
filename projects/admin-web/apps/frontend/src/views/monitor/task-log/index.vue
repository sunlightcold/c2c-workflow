<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { TaskLogApi } from '#/api';

import { Page } from '@vben/common-ui';

import { filterTaskLogsApi } from '#/api';
import { CommonStatusOptions3 } from '#/constants';
import { useResourceGrid } from '#/hooks';
import { VxeUtils } from '#/utils';

interface RowType extends TaskLogApi.TaskLogData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'taskName',
      label: '任务名称',
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        options: CommonStatusOptions3,
      },
    },
    {
      component: 'Select',
      fieldName: 'taskSource',
      label: '任务来源',
      componentProps: {
        options: [
          { label: '自定义', value: 'custom' },
          { label: '系统', value: 'system' },
        ],
      },
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
    { type: 'seq', width: 70, align: 'center' },
    { field: 'taskId', title: '任务编号', width: 300 },
    { field: 'taskName', title: '任务名称', width: 200 },
    VxeUtils.tag.getColumn({
      column: {
        field: 'consumeTime',
        title: '耗时',
        width: 100,
        formatter: ({ cellValue }) => `${cellValue}ms`,
      },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'status', title: '状态', width: 150 },
      cellValueMap: { 0: '失败', 1: '成功' },
      colorMap: { 0: 'red', 1: 'green' },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'taskSource', title: '来源', width: 120 },
      cellValueMap: { custom: '自定义', system: '系统' },
      colorMap: { custom: 'blue', system: 'orange' },
    }),
    { field: 'detail', title: '任务执行结果', align: 'left' },
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
  ],
};

const [Grid] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterTaskLogsApi,
});
</script>

<template>
  <Page auto-content-height>
    <Grid />
  </Page>
</template>
