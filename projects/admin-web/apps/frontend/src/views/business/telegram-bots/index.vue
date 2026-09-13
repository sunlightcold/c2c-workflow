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
  updateTelegramBotApi,
} from '#/api';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import {
  businessFormOption,
  businessModalProps,
  layoutBusinessFormRules,
} from '../shared/business-form-layout';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessStatusColor,
  businessStatusOptions,
  businessStatusText,
} from '../shared/business-ui';
import {
  telegramBotTypeText,
  telegramCapabilityOptions,
} from '../shared/telegram-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');

type BotQueryParams = Omit<Parameters<typeof getTelegramBotsApi>[0], 'page'> & {
  pageIndex: number;
};

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      fieldName: 'tenantId',
      label: '经营单位',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => {
          selectedTenantId.value = value;
          void gridApi.query();
        },
        options: tenantOptions,
        showSearch: true,
      }),
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入编码' },
      fieldName: 'code',
      label: '机器人编码',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入名称' },
      fieldName: 'name',
      label: '机器人名称',
    },
    {
      component: 'Select',
      componentProps: { allowClear: true, options: businessStatusOptions },
      fieldName: 'status',
      label: '状态',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.TelegramBot> = {
  columns: [
    { align: 'center', type: 'seq', width: 60 },
    { field: 'code', title: '机器人编码', width: 160 },
    { field: 'name', minWidth: 180, title: '机器人名称' },
    {
      field: 'botType',
      formatter: ({ cellValue }) =>
        telegramBotTypeText(cellValue as BusinessApi.TelegramBotType),
      title: '机器人类型',
      width: 120,
    },
    {
      field: 'capabilities',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
      title: '已启用能力',
      width: 120,
    },
    {
      field: 'tokenConfigured',
      slots: { default: 'secret' },
      title: '密钥配置',
      width: 120,
    },
    { field: 'status', slots: { default: 'status' }, title: '状态', width: 90 },
    {
      field: 'actions',
      fixed: 'right',
      slots: { default: 'actions' },
      title: '操作',
      width: 230,
    },
  ],
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramBot,
  Record<string, unknown>,
  BotQueryParams
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    pageIndex: page.currentPage,
    pageSize: page.pageSize,
    tenantId: selectedTenantId.value,
  }),
  query: async ({ pageIndex, ...params }) => {
    if (!params.tenantId) {
      return createEmptyBusinessPage(pageIndex, params.pageSize);
    }
    return getTelegramBotsApi({ ...params, page: pageIndex });
  },
});

const { FormModalRender, formModalClose, formModalShow } = useFormModal();

function botFormRules(editing = false) {
  return [
    {
      field: 'name',
      title: '机器人名称',
      type: 'input',
      validate: [
        { message: '请输入机器人名称', required: true, trigger: 'blur' },
      ],
    },
    {
      field: 'token',
      props: {
        autocomplete: 'new-password',
        placeholder: editing
          ? '不修改请留空'
          : '请输入 Telegram Bot Token，例如 123456789:AA...',
        type: 'password',
      },
      title: 'Bot Token',
      type: 'input',
      validate: editing
        ? []
        : [{ message: '请输入 Bot Token', required: true, trigger: 'blur' }],
    },
    {
      field: 'capabilities',
      options: telegramCapabilityOptions,
      title: '机器人能力',
      type: 'checkbox',
      validate: [
        { message: '请选择至少一项能力', required: true, trigger: 'change' },
      ],
    },
    {
      field: 'paymentOrderRequireConfirmation',
      title: '支付二次确认',
      type: 'switch',
      value: true,
    },
    {
      field: 'batchSubmitRequireConfirmation',
      title: '批次二次确认',
      type: 'switch',
      value: true,
    },
    {
      field: 'description',
      props: { maxlength: 500, rows: 3, showCount: true },
      title: '备注',
      type: 'textarea',
    },
  ];
}

function botModalOptions(title: string, editing = false) {
  return {
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(botFormRules(editing), [
        'capabilities',
        'description',
        'token',
      ]),
    },
    props: businessModalProps(title),
  };
}

function cleanOptionalSecrets<T extends Record<string, unknown>>(data: T) {
  const value = { ...data };
  for (const key of ['description', 'token']) {
    if (value[key] === '') delete value[key];
  }
  return value;
}

function openCreate() {
  formModalShow(botModalOptions('新增支付机器人'), {
    onOk: async (api) => {
      await api.validate();
      const data = cleanOptionalSecrets(api.formData());
      await runResourceAction({
        action: () =>
          createTelegramBotApi({
            ...(data as Parameters<typeof createTelegramBotApi>[0]),
            botType: 'PAYMENT',
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '机器人已创建',
      });
    },
  });
}

async function openEdit(row: BusinessApi.TelegramBot) {
  const [formApi] = await formModalShow(
    botModalOptions('编辑支付机器人', true),
    {
      onOk: async (api) => {
        await api.validate();
        const data = cleanOptionalSecrets(api.formData());
        await runResourceAction({
          action: () =>
            updateTelegramBotApi(row.id, {
              ...(data as Parameters<typeof updateTelegramBotApi>[1]),
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '机器人已更新',
        });
      },
    },
  );
  formApi?.setValue({
    batchSubmitRequireConfirmation: row.batchSubmitRequireConfirmation,
    capabilities: row.capabilities,
    description: row.description ?? '',
    name: row.name,
    paymentOrderRequireConfirmation: row.paymentOrderRequireConfirmation,
    token: '',
  });
}

function toggle(row: BusinessApi.TelegramBot) {
  const status = row.status === 'active' ? 'disabled' : 'active';
  return runResourceAction({
    action: () =>
      setTelegramBotStatusApi(row.id, status, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '机器人已启用' : '机器人已停用',
  });
}

function remove(row: BusinessApi.TelegramBot) {
  return confirmResourceAction({
    action: () => deleteTelegramBotApi(row.id, selectedTenantId.value),
    content: '已有群组记录的机器人不能删除，只能停用。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: () => gridApi.query(),
    successMessage: '机器人已删除',
    title: `确认删除“${row.name}”吗？`,
  });
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (!selectedTenantId.value) return;
  await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['telegram:bot:create']"
          :disabled="!selectedTenantId"
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增机器人
        </AButton>
      </template>
      <template #secret="{ row }">
        <ATag :color="row.tokenConfigured ? 'success' : 'warning'">
          {{ row.tokenConfigured ? '已配置' : '未配置' }}
        </ATag>
      </template>
      <template #status="{ row }">
        <ATag :color="businessStatusColor(row.status)">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #actions="{ row }">
        <ASpace :size="4">
          <AButton
            v-access:code="['telegram:bot:update']"
            size="small"
            @click="openEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['telegram:bot:update']"
            size="small"
            @click="toggle(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </AButton>
          <AButton
            v-access:code="['telegram:bot:delete']"
            danger
            size="small"
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
