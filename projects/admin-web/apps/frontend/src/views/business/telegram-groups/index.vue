<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { Modal } from 'ant-design-vue';

import {
  approveTelegramGroupApi,
  createTelegramGroupApi,
  getMerchantsApi,
  getTelegramBotsApi,
  getTelegramGroupsApi,
  unbindTelegramGroupApi,
  updateTelegramGroupApi,
} from '#/api';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import { businessEnumText, businessStateColor } from '../shared/business-ui';
import {
  telegramBindingStateOptions,
  telegramCapabilityOptions,
  telegramPaymentSceneOptions,
} from '../shared/telegram-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadDefaultTenantId, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const bots = ref<BusinessApi.TelegramBot[]>([]);
const merchants = ref<BusinessApi.Merchant[]>([]);

type GroupQueryParams = Omit<
  Parameters<typeof getTelegramGroupsApi>[0],
  'page'
> & { name?: string; pageIndex: number };

const botOptions = () =>
  bots.value.map((bot) => ({
    disabled: bot.status !== 'active',
    label: bot.name,
    value: bot.id,
  }));
const merchantOptions = () =>
  merchants.value.map((merchant) => ({
    disabled: merchant.status !== 'active',
    label: merchant.name,
    value: merchant.id,
  }));

async function loadTenantReferences(tenantId: string) {
  [bots.value, merchants.value] = await Promise.all([
    getTelegramBotsApi({ page: 1, pageSize: 100, tenantId }).then(
      ({ items }) => items,
    ),
    getMerchantsApi({ tenantId }),
  ]);
}

async function changeTenant(value: string) {
  selectedTenantId.value = value;
  await Promise.all([
    gridApi.formApi.setFieldValue('botId', undefined),
    gridApi.formApi.setFieldValue('merchantId', undefined),
  ]);
  await loadTenantReferences(value);
  await gridApi.query();
}

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => void changeTenant(value),
        options: tenantOptions,
        showSearch: true,
      }),
      fieldName: 'tenantId',
      label: '经营单位',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        options: botOptions(),
        showSearch: true,
      }),
      fieldName: 'botId',
      label: '机器人',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        options: merchantOptions(),
        showSearch: true,
      }),
      fieldName: 'merchantId',
      label: '商家账号',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入群组名称' },
      fieldName: 'name',
      label: '群组名称',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: telegramBindingStateOptions,
      },
      fieldName: 'bindingState',
      label: '绑定状态',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.TelegramGroup> = {
  columns: [
    { align: 'center', type: 'seq', width: 60 },
    { field: 'name', minWidth: 170, title: '群组名称' },
    {
      field: 'botId',
      formatter: ({ cellValue }) =>
        botOptions().find(({ value }) => value === cellValue)?.label ??
        String(cellValue),
      minWidth: 160,
      title: '机器人',
    },
    {
      field: 'merchantId',
      formatter: ({ cellValue }) =>
        merchantOptions().find(({ value }) => value === cellValue)?.label ??
        String(cellValue),
      minWidth: 160,
      title: '绑定商家',
    },
    { field: 'chatId', minWidth: 170, title: 'Telegram Chat ID' },
    {
      field: 'paymentScene',
      formatter: ({ cellValue }) => businessEnumText(cellValue as string),
      title: '支付场景',
      width: 130,
    },
    {
      field: 'bindingState',
      slots: { default: 'state' },
      title: '绑定状态',
      width: 110,
    },
    {
      field: 'notificationsEnabled',
      formatter: ({ cellValue }) => (cellValue ? '已启用' : '已停用'),
      title: '业务通知',
      width: 100,
    },
    {
      field: 'capabilities',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
      title: '群组能力',
      width: 110,
    },
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
  BusinessApi.TelegramGroup,
  Record<string, unknown>,
  GroupQueryParams
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    pageIndex: page.currentPage,
    pageSize: page.pageSize,
    tenantId: selectedTenantId.value,
  }),
  query: ({ pageIndex, ...params }) =>
    getTelegramGroupsApi({ ...params, page: pageIndex }),
});

const { FormModalRender, formModalClose, formModalShow } = useFormModal();

function groupRules() {
  return [
    {
      field: 'name',
      title: '群组名称',
      type: 'input',
      validate: [
        { message: '请输入群组名称', required: true, trigger: 'blur' },
      ],
    },
    {
      field: 'botId',
      props: { options: botOptions(), showSearch: true },
      title: '机器人',
      type: 'select',
      validate: [
        { message: '请选择机器人', required: true, trigger: 'change' },
      ],
    },
    {
      field: 'merchantId',
      props: { options: merchantOptions(), showSearch: true },
      title: '绑定商家',
      type: 'select',
      validate: [
        { message: '请选择商家账号', required: true, trigger: 'change' },
      ],
    },
    {
      field: 'paymentScene',
      props: { options: telegramPaymentSceneOptions },
      title: '支付场景',
      type: 'select',
      validate: [
        { message: '请选择支付场景', required: true, trigger: 'change' },
      ],
    },
    {
      field: 'capabilities',
      props: { mode: 'multiple', options: telegramCapabilityOptions },
      title: '群组能力',
      type: 'select',
      validate: [
        {
          message: '请选择至少一项群组能力',
          required: true,
          trigger: 'change',
        },
      ],
    },
    {
      field: 'notificationsEnabled',
      title: '启用业务通知',
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

function groupModalOptions(title: string) {
  return {
    formProps: {
      option: { form: { layout: 'vertical' as const }, submitBtn: false },
      rule: groupRules(),
    },
    props: { centered: true, title, width: 680 },
  };
}

function openCreate() {
  formModalShow(groupModalOptions('新增群组绑定'), {
    onOk: async (api) => {
      await api.validate();
      let verificationCode = '';
      const data = api.formData() as Parameters<
        typeof createTelegramGroupApi
      >[0];
      await runResourceAction({
        action: async () => {
          const result = await createTelegramGroupApi({
            ...data,
            tenantId: selectedTenantId.value,
          });
          verificationCode = result.verificationCode;
          return result;
        },
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
          Modal.info({
            centered: true,
            content: `验证码：${verificationCode}（15 分钟内有效）`,
            title: '群组绑定验证码',
          });
        },
        successMessage: '群组绑定已创建',
      });
    },
  });
}

async function openEdit(row: BusinessApi.TelegramGroup) {
  const [formApi] = await formModalShow(groupModalOptions('编辑群组绑定'), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as Parameters<
        typeof updateTelegramGroupApi
      >[1];
      await runResourceAction({
        action: () =>
          updateTelegramGroupApi(row.id, {
            ...data,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '群组绑定已更新',
      });
    },
  });
  formApi?.setValue({
    botId: row.botId,
    capabilities: row.capabilities,
    description: row.description ?? '',
    merchantId: row.merchantId,
    name: row.name,
    notificationsEnabled: row.notificationsEnabled,
    paymentScene: row.paymentScene,
  });
}

function approve(row: BusinessApi.TelegramGroup) {
  formModalShow(
    {
      formProps: {
        option: { form: { layout: 'vertical' as const }, submitBtn: false },
        rule: [
          {
            field: 'chatId',
            props: { placeholder: '例如 -1001234567890' },
            title: 'Telegram Chat ID',
            type: 'input',
            validate: [
              { message: '请输入 Chat ID', required: true, trigger: 'blur' },
            ],
          },
          { field: 'chatName', title: 'Telegram 群名', type: 'input' },
          {
            field: 'chatType',
            options: [
              { label: '超级群组', value: 'supergroup' },
              { label: '普通群组', value: 'group' },
            ],
            title: '群类型',
            type: 'radio',
            value: 'supergroup',
          },
        ],
      },
      props: { centered: true, title: '审批群组绑定', width: 520 },
    },
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as Parameters<
          typeof approveTelegramGroupApi
        >[1];
        await runResourceAction({
          action: () =>
            approveTelegramGroupApi(row.id, {
              ...data,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '群组已绑定',
        });
      },
    },
  );
}

function unbind(row: BusinessApi.TelegramGroup) {
  return confirmResourceAction({
    action: () => unbindTelegramGroupApi(row.id, selectedTenantId.value),
    content: '解绑后该群成员会被停用，历史记录保留。',
    okButtonProps: { danger: true },
    okText: '解绑',
    onSuccess: () => gridApi.query(),
    successMessage: '群组已解绑',
    title: `确认解绑“${row.name}”吗？`,
  });
}

onMounted(async () => {
  selectedTenantId.value = (await loadDefaultTenantId()) || '';
  if (!selectedTenantId.value) return;
  await loadTenantReferences(selectedTenantId.value);
  await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['telegram:group:create']"
          :disabled="
            !selectedTenantId || bots.length === 0 || merchants.length === 0
          "
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增群组绑定
        </AButton>
      </template>
      <template #state="{ row }">
        <ATag :color="businessStateColor(row.bindingState)">
          {{ businessEnumText(row.bindingState) }}
        </ATag>
      </template>
      <template #actions="{ row }">
        <ASpace :size="4">
          <AButton
            v-access:code="['telegram:group:update']"
            size="small"
            @click="openEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-if="row.bindingState === 'PENDING'"
            v-access:code="['telegram:group:approve']"
            size="small"
            @click="approve(row)"
          >
            审批
          </AButton>
          <AButton
            v-if="row.bindingState !== 'UNBOUND'"
            v-access:code="['telegram:group:unbind']"
            danger
            size="small"
            @click="unbind(row)"
          >
            解绑
          </AButton>
        </ASpace>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
