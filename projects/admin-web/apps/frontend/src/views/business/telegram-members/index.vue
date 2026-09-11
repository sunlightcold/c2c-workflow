<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createTelegramMemberApi,
  deleteTelegramMemberApi,
  getTelegramGroupsApi,
  getTelegramMemberEligibleUsersApi,
  getTelegramMembersApi,
  setTelegramMemberStatusApi,
  updateTelegramMemberApi,
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
  telegramCapabilityOptions,
  telegramGroupRoleOptions,
  telegramRoleText,
  telegramUserOptions,
} from '../shared/telegram-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const groups = ref<BusinessApi.TelegramGroup[]>([]);
const users = ref<BusinessApi.TelegramEligibleUser[]>([]);

type MemberQueryParams = Omit<
  Parameters<typeof getTelegramMembersApi>[0],
  'page'
> & {
  pageIndex: number;
  status?: BusinessApi.BusinessStatus;
  telegramUserId?: string;
};

const groupOptions = () =>
  groups.value.map((group) => ({
    disabled: group.bindingState !== 'ACTIVE',
    label: group.name,
    value: group.id,
  }));
const userOptions = () => telegramUserOptions(users.value);

async function loadTenantReferences(tenantId: string) {
  [groups.value, users.value] = await Promise.all([
    getTelegramGroupsApi({ page: 1, pageSize: 100, tenantId }).then(
      ({ items }) => items,
    ),
    getTelegramMemberEligibleUsersApi(tenantId),
  ]);
}

async function changeTenant(value: string) {
  selectedTenantId.value = value;
  await gridApi.formApi.setFieldValue('groupId', undefined);
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
        options: groupOptions(),
        showSearch: true,
      }),
      fieldName: 'groupId',
      label: '群组',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入数字用户 ID' },
      fieldName: 'telegramUserId',
      label: 'Telegram 用户 ID',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: telegramGroupRoleOptions,
      },
      fieldName: 'role',
      label: '角色',
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

const gridOptions: VxeTableGridOptions<BusinessApi.TelegramMember> = {
  columns: [
    { align: 'center', type: 'seq', width: 60 },
    { field: 'telegramUserId', title: 'Telegram 用户 ID', width: 180 },
    { field: 'telegramUsername', minWidth: 140, title: 'Telegram 用户名' },
    { field: 'displayName', minWidth: 130, title: '显示名称' },
    {
      field: 'userId',
      formatter: ({ cellValue }) =>
        userOptions().find(({ value }) => value === cellValue)?.label ??
        String(cellValue),
      minWidth: 170,
      title: '后台用户',
    },
    {
      field: 'groupId',
      formatter: ({ cellValue }) =>
        groupOptions().find(({ value }) => value === cellValue)?.label ??
        String(cellValue),
      minWidth: 160,
      title: '群组',
    },
    {
      field: 'role',
      formatter: ({ cellValue }) =>
        telegramRoleText(cellValue as BusinessApi.TelegramGroupRole),
      title: '角色',
      width: 110,
    },
    {
      field: 'capabilities',
      formatter: ({ cellValue }) => `${(cellValue as string[]).length} 项`,
      title: '成员权限',
      width: 110,
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
  BusinessApi.TelegramMember,
  Record<string, unknown>,
  MemberQueryParams
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
    return getTelegramMembersApi({ ...params, page: pageIndex });
  },
});

const { FormModalRender, formModalClose, formModalShow } = useFormModal();

function memberRules(editing = false) {
  return [
    ...(editing
      ? []
      : [
          {
            field: 'groupId',
            props: { options: groupOptions(), showSearch: true },
            title: '群组',
            type: 'select',
            validate: [
              {
                message: '请选择已绑定群组',
                required: true,
                trigger: 'change',
              },
            ],
          },
          {
            field: 'userId',
            props: { options: userOptions(), showSearch: true },
            title: '后台用户',
            type: 'select',
            validate: [
              { message: '请选择后台用户', required: true, trigger: 'change' },
            ],
          },
        ]),
    {
      field: 'telegramUserId',
      props: { maxlength: 32 },
      title: 'Telegram 用户 ID',
      type: 'input',
      validate: [
        {
          message: '请输入 Telegram 数字用户 ID',
          pattern: /^\d{1,32}$/,
          required: true,
          trigger: 'blur',
        },
      ],
    },
    {
      field: 'telegramUsername',
      props: { maxlength: 64 },
      title: 'Telegram 用户名',
      type: 'input',
    },
    {
      field: 'displayName',
      props: { maxlength: 100 },
      title: '显示名称',
      type: 'input',
    },
    {
      field: 'role',
      props: { options: telegramGroupRoleOptions },
      title: '群内角色',
      type: 'select',
      validate: [
        { message: '请选择群内角色', required: true, trigger: 'change' },
      ],
    },
    {
      field: 'capabilities',
      props: { mode: 'multiple', options: telegramCapabilityOptions },
      title: '成员权限',
      type: 'select',
      validate: [
        {
          message: '请选择至少一项成员权限',
          required: true,
          trigger: 'change',
        },
      ],
    },
  ];
}

function memberModalOptions(title: string, editing = false) {
  return {
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(memberRules(editing), ['capabilities']),
    },
    props: businessModalProps(title),
  };
}

function openCreate() {
  formModalShow(memberModalOptions('新增群组成员'), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as Parameters<
        typeof createTelegramMemberApi
      >[0];
      await runResourceAction({
        action: () =>
          createTelegramMemberApi({
            ...data,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '群组成员已新增',
      });
    },
  });
}

async function openEdit(row: BusinessApi.TelegramMember) {
  const [formApi] = await formModalShow(
    memberModalOptions('编辑群组成员', true),
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as Parameters<
          typeof updateTelegramMemberApi
        >[1];
        await runResourceAction({
          action: () =>
            updateTelegramMemberApi(row.id, {
              ...data,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '群组成员已更新',
        });
      },
    },
  );
  formApi?.setValue({
    capabilities: row.capabilities,
    displayName: row.displayName ?? '',
    role: row.role,
    telegramUserId: row.telegramUserId,
    telegramUsername: row.telegramUsername ?? '',
  });
}

function toggle(row: BusinessApi.TelegramMember) {
  const status = row.status === 'active' ? 'disabled' : 'active';
  return runResourceAction({
    action: () =>
      setTelegramMemberStatusApi(row.id, status, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '群组成员已启用' : '群组成员已停用',
  });
}

function remove(row: BusinessApi.TelegramMember) {
  return confirmResourceAction({
    action: () => deleteTelegramMemberApi(row.id, selectedTenantId.value),
    content: '移除后该 Telegram 用户不能再执行群内业务命令。',
    okButtonProps: { danger: true },
    okText: '移除',
    onSuccess: () => gridApi.query(),
    successMessage: '群组成员已移除',
    title: `确认移除“${row.displayName ?? row.telegramUserId}”吗？`,
  });
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
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
          v-access:code="['telegram:member:create']"
          :disabled="
            !selectedTenantId || groups.length === 0 || users.length === 0
          "
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增群组成员
        </AButton>
      </template>
      <template #status="{ row }">
        <ATag :color="businessStatusColor(row.status)">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #actions="{ row }">
        <ASpace :size="4">
          <AButton
            v-access:code="['telegram:member:update']"
            size="small"
            @click="openEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['telegram:member:update']"
            size="small"
            @click="toggle(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </AButton>
          <AButton
            v-access:code="['telegram:member:delete']"
            danger
            size="small"
            @click="remove(row)"
          >
            移除
          </AButton>
        </ASpace>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
