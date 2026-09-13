<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { OnlineApi } from '#/api';

import { Page } from '@vben/common-ui';

import { filterOnlineApi, revokeOnlineSessionApi } from '#/api';
import { confirmResourceAction, useResourceGrid } from '#/hooks';
import { VxeUtils } from '#/utils';

interface RowType extends OnlineApi.OnlineData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'username',
      label: '用户名',
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '连接状态',
      componentProps: {
        allowClear: true,
        options: [
          { label: '在线', value: 'online' },
          { label: '离线', value: 'offline' },
        ],
        placeholder: '全部',
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
    { type: 'seq', width: 70 },
    { field: 'id', title: 'Token 会话编号', width: 300 },
    { field: 'username', title: '用户名', width: 150 },
    VxeUtils.tag.getColumn({
      column: { field: 'status', title: '连接状态', width: 120 },
      cellValueMap: { offline: '离线', online: '在线' },
      colorMap: { offline: 'red', online: 'blue' },
      props: { color: 'blue' },
    }),
    { field: 'ip', title: 'IP', width: 120 },
    { field: 'os', title: '操作系统', width: 100 },
    { field: 'browser', title: '浏览器', width: 150 },
    { field: 'country', title: '国家', width: 100 },
    { field: 'region', title: '地区', width: 100 },
    { field: 'city', title: '城市', width: 100 },
    {
      field: 'loginAt',
      title: '最近登录时间',
      formatter: 'formatDateTime',
      width: 160,
    },
    {
      field: 'logoutAt',
      title: '最近离线时间',
      formatter: 'formatDateTime',
      width: 160,
    },
    { field: 'agent', title: '代理' },
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
  query: filterOnlineApi,
});

function onRevokeSession(row: RowType) {
  confirmResourceAction({
    action: async () => {
      const result = await revokeOnlineSessionApi(row.id);
      if (!result.revoked) {
        throw new Error('会话已不存在或无法撤销');
      }
    },
    onSuccess: () => gApi.query(),
    successMessage: '撤销成功',
    title: '确认撤销该 Token 会话吗?',
  });
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #action="{ row }">
        <ASpace>
          <AButton
            v-access:code="['monitor:online:delete']"
            size="small"
            danger
            @click="onRevokeSession(row)"
          >
            撤销
          </AButton>
        </ASpace>
      </template>
    </Grid>
  </Page>
</template>
