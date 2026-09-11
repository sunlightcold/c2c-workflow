<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createTelegramBotApi,
  deleteTelegramBotApi,
  getTelegramBotsApi,
  setTelegramBotStatusApi,
} from '#/api';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import {
  businessStatusColor,
  businessStatusOptions,
  businessStatusText,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadDefaultTenantId, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const capabilityOptions = [
  { label: '订单查询', value: 'ORDER_QUERY' },
  { label: '余额查询', value: 'BALANCE_QUERY' },
  { label: '获取回单', value: 'RECEIPT_QUERY' },
  { label: '手工支付', value: 'MANUAL_PAYMENT' },
  { label: '支付宝批量支付', value: 'ALIPAY_BATCH_PAYMENT' },
  { label: '提交支付批次', value: 'PAYMENT_BATCH_SUBMIT' },
  { label: 'C2C 订单支付', value: 'C2C_ORDER_PAYMENT' },
  { label: 'C2C 订单申诉', value: 'C2C_APPEAL' },
  { label: '支付统计', value: 'PAYMENT_STATISTICS' },
];
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
        showSearch: true,
        allowClear: false,
        onChange: (value: string) => {
          selectedTenantId.value = value;
          void gridApi.query();
        },
      }),
    },
    {
      component: 'Input',
      fieldName: 'code',
      label: '机器人编码',
      componentProps: { placeholder: '请输入编码' },
    },
    {
      component: 'Input',
      fieldName: 'name',
      label: '机器人名称',
      componentProps: { placeholder: '请输入名称' },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: { options: businessStatusOptions, allowClear: true },
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};
const gridOptions: VxeTableGridOptions<BusinessApi.TelegramBot> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'code', title: '编码', width: 150 },
    { field: 'name', title: '名称', minWidth: 180 },
    {
      field: 'capabilities',
      title: '已启用能力',
      minWidth: 220,
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
    },
    {
      field: 'tokenConfigured',
      title: 'Token',
      width: 100,
      formatter: ({ cellValue }) => (cellValue ? '已配置' : '未配置'),
    },
    { field: 'status', title: '状态', slots: { default: 'status' }, width: 90 },
    {
      field: 'actions',
      title: '操作',
      slots: { default: 'actions' },
      fixed: 'right',
      width: 190,
    },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramBot,
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
    getTelegramBotsApi({
      ...params,
      tenantId: selectedTenantId.value,
      page: params.page as number,
      pageSize: params.pageSize as number,
    }),
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();
function openCreate() {
  formModalShow(
    {
      props: { title: '新增支付机器人', width: 620 },
      formProps: {
        rule: [
          {
            field: 'code',
            title: '机器人编码',
            type: 'input',
            validate: [{ required: true, message: '请输入编码' }],
          },
          {
            field: 'name',
            title: '机器人名称',
            type: 'input',
            validate: [{ required: true, message: '请输入名称' }],
          },
          {
            field: 'botType',
            title: '机器人类型',
            type: 'select',
            props: {
              options: [
                { label: '支付机器人', value: 'PAYMENT' },
                { label: '商家机器人', value: 'MERCHANT' },
                { label: '总部机器人', value: 'HQ' },
              ],
            },
            validate: [{ required: true, message: '请选择机器人类型' }],
          },
          {
            field: 'tokenRef',
            title: 'Token 引用',
            type: 'input',
            props: { placeholder: 'env://TELEGRAM_TOKEN' },
            validate: [{ required: true, message: '请输入 Secret 引用' }],
          },
          {
            field: 'capabilities',
            title: '机器人能力',
            type: 'select',
            props: { mode: 'multiple', options: capabilityOptions },
            validate: [{ required: true, message: '请选择至少一项能力' }],
          },
        ],
      },
    },
    {
      onOk: async (api) => {
        await api.validate();
        await runResourceAction({
          action: () =>
            createTelegramBotApi({
              ...api.formData(),
              tenantId: selectedTenantId.value,
            } as never),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '机器人已创建',
        });
      },
    },
  );
}
function toggle(row: BusinessApi.TelegramBot) {
  return runResourceAction({
    action: () =>
      setTelegramBotStatusApi(
        row.id,
        row.status === 'active' ? 'disabled' : 'active',
        selectedTenantId.value,
      ),
    onSuccess: () => gridApi.query(),
    successMessage: '状态已更新',
  });
}
function remove(row: BusinessApi.TelegramBot) {
  return confirmResourceAction({
    title: `确认删除“${row.name}”吗？`,
    content: '已有群组记录的机器人不能删除，只能停用。',
    okText: '删除',
    okButtonProps: { danger: true },
    action: () => deleteTelegramBotApi(row.id, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage: '机器人已删除',
  });
}
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
      <template #toolbar-actions>
        <AButton
          v-access:code="['telegram:bot:create']"
          type="primary"
          size="small"
          @click="openCreate"
        >
          新增机器人
        </AButton>
      </template>
      <template #status="{ row }">
        <ATag :color="businessStatusColor(row.status)">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #actions="{ row }">
        <ASpace>
          <AButton
            v-access:code="['telegram:bot:update']"
            size="small"
            type="link"
            @click="toggle(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </AButton>
          <AButton
            v-access:code="['telegram:bot:delete']"
            size="small"
            type="link"
            danger
            @click="remove(row)"
          >
            删除
          </AButton>
        </ASpace>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
