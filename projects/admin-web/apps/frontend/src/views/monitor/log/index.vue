<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { LogApi } from '#/api';

import { Page } from '@vben/common-ui';

import { filterLogsApi } from '#/api';
import { useResourceGrid } from '#/hooks';

interface RowType extends LogApi.LogData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'title',
      label: '模块',
    },
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'content',
      label: '操作内容',
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
    { type: 'seq', width: 70, align: 'center' },
    { field: 'title', title: '模块', align: 'left' },
    { field: 'content', title: '操作内容', align: 'left' },
    { field: 'username', title: '操作用户' },
    { field: 'httpMethod', title: '请求方法', width: 100 },
    { field: 'ip', title: 'IP' },
    { field: 'os', title: '操作系统' },
    { field: 'browser', title: '浏览器' },
    { field: 'city', title: '城市' },
    { field: 'url', title: 'API地址', align: 'left', width: 'auto' },
    {
      field: 'createdAt',
      title: '操作时间',
      formatter: 'formatDateTime',
    },
  ],
};

const [Grid] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterLogsApi,
});
</script>

<template>
  <Page auto-content-height>
    <Grid />
  </Page>
</template>
