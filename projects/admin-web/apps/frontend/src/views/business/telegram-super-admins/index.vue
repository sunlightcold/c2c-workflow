<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createTelegramSuperAdminApi,
  deleteTelegramSuperAdminApi,
  getTelegramGroupsApi,
  getTelegramSuperAdminEligibleUsersApi,
  getTelegramSuperAdminsApi,
  setTelegramSuperAdminStatusApi,
  updateTelegramSuperAdminApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
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
import { businessStatusOptions } from '../shared/business-ui';
import {
  telegramScopeOptions,
  telegramScopeText,
  telegramUserOptions,
} from '../shared/telegram-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const groups = ref<BusinessApi.TelegramGroup[]>([]);
const users = ref<BusinessApi.TelegramEligibleUser[]>([]);

type SuperAdminQueryParams = Omit<
  Parameters<typeof getTelegramSuperAdminsApi>[0],
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
    getTelegramSuperAdminEligibleUsersApi(tenantId),
  ]);
}

async function changeTenant(value: string) {
  selectedTenantId.value = value;
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
      component: 'Input',
      componentProps: { placeholder: '请输入数字用户 ID' },
      fieldName: 'telegramUserId',
      label: 'Telegram 用户 ID',
    },
    {
      component: 'Select',
      componentProps: { allowClear: true, options: telegramScopeOptions },
      fieldName: 'scopeType',
      label: '管理范围',
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

const gridOptions: VxeTableGridOptions<BusinessApi.TelegramSuperAdmin> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'telegramUserId', title: 'Telegram 用户 ID', width: 180 },
    { field: 'telegramUsername', minWidth: 150, title: 'Telegram 用户名' },
    {
      field: 'userId',
      formatter: ({ cellValue }) =>
        userOptions().find(({ value }) => value === cellValue)?.label ??
        '未知后台用户',
      minWidth: 180,
      title: '后台用户',
    },
    {
      field: 'scopeType',
      formatter: ({ cellValue }) =>
        telegramScopeText(cellValue as BusinessApi.TelegramSuperAdminScopeType),
      title: '管理范围',
      width: 120,
    },
    {
      field: 'groupIds',
      slots: { default: 'groups' },
      title: '指定群组',
      width: 120,
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 110,
    },
    {
      align: 'center',
      field: 'actions',
      fixed: 'right',
      slots: { default: 'actions' },
      title: '操作',
      width: 170,
    },
  ],
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.TelegramSuperAdmin,
  Record<string, unknown>,
  SuperAdminQueryParams
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
    return getTelegramSuperAdminsApi({ ...params, page: pageIndex });
  },
});

const { FormModalRender, formModalClose, formModalShow } = useFormModal();

function superAdminRules(editing = false) {
  return [
    ...(editing
      ? []
      : [
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
      control: [
        {
          rule: [
            {
              col: { span: 24 },
              field: 'groupIds',
              props: {
                mode: 'multiple',
                options: groupOptions(),
                showSearch: true,
              },
              title: '指定群组',
              type: 'select',
              validate: [
                {
                  message: '请至少选择一个已绑定群组',
                  required: true,
                  trigger: 'change',
                },
              ],
            },
          ],
          value: 'SPECIFIED_GROUPS',
        },
      ],
      field: 'scopeType',
      options: telegramScopeOptions,
      title: '管理范围',
      type: 'radio',
      validate: [
        { message: '请选择管理范围', required: true, trigger: 'change' },
      ],
      value: 'ALL_GROUPS',
    },
  ];
}

function superAdminModalOptions(title: string, editing = false) {
  return {
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(superAdminRules(editing), ['scopeType']),
    },
    props: businessModalProps(title),
  };
}

function normalizeScope<T extends Record<string, unknown>>(data: T) {
  return {
    ...data,
    groupIds: data.scopeType === 'SPECIFIED_GROUPS' ? data.groupIds : [],
  };
}

function openCreate() {
  formModalShow(superAdminModalOptions('新增超级管理员'), {
    onOk: async (api) => {
      await api.validate();
      const data = normalizeScope(api.formData()) as Parameters<
        typeof createTelegramSuperAdminApi
      >[0];
      await runResourceAction({
        action: () =>
          createTelegramSuperAdminApi({
            ...data,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '超级管理员已新增',
      });
    },
  });
}

async function openEdit(row: BusinessApi.TelegramSuperAdmin) {
  const [formApi] = await formModalShow(
    superAdminModalOptions('编辑超级管理员', true),
    {
      onOk: async (api) => {
        await api.validate();
        const data = normalizeScope(api.formData()) as Parameters<
          typeof updateTelegramSuperAdminApi
        >[1];
        await runResourceAction({
          action: () =>
            updateTelegramSuperAdminApi(row.id, {
              ...data,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '超级管理员已更新',
        });
      },
    },
  );
  formApi?.setValue({
    groupIds: row.groupIds,
    scopeType: row.scopeType,
    telegramUserId: row.telegramUserId,
    telegramUsername: row.telegramUsername ?? '',
  });
}

function changeStatus(row: BusinessApi.TelegramSuperAdmin, checked: boolean) {
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setTelegramSuperAdminStatusApi(row.id, status, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage:
      status === 'active' ? '超级管理员已启用' : '超级管理员已停用',
  });
}

function remove(row: BusinessApi.TelegramSuperAdmin) {
  return confirmResourceAction({
    action: () => deleteTelegramSuperAdminApi(row.id, selectedTenantId.value),
    content: '移除后该 Telegram 用户不再拥有所属单位级管理权限。',
    okButtonProps: { danger: true },
    okText: '移除',
    onSuccess: () => gridApi.query(),
    successMessage: '超级管理员已移除',
    title: `确认移除“${row.telegramUsername ?? row.telegramUserId}”吗？`,
  });
}

function groupNames(groupIds: string[]) {
  if (groupIds.length === 0) return '-';
  return groupIds
    .map(
      (id) =>
        groupOptions().find((option) => option.value === id)?.label ??
        '未知群组',
    )
    .join('、');
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
          v-access:code="['telegram:superAdmin:create']"
          :disabled="!selectedTenantId || users.length === 0"
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增超级管理员
        </AButton>
      </template>
      <template #groups="{ row }">
        <ATooltip :title="groupNames(row.groupIds)">
          <span>{{ row.groupIds.length }} 个群组</span>
        </ATooltip>
      </template>
      <template #status="{ row }">
        <AsyncStatusSwitch
          v-access:code="['telegram:superAdmin:update']"
          :checked="row.status === 'active'"
          :label="`${row.telegramUsername ?? row.telegramUserId}状态`"
          :request="(checked) => changeStatus(row, checked)"
        />
      </template>
      <template #actions="{ row }">
        <ASpace :size="4">
          <AButton
            v-access:code="['telegram:superAdmin:update']"
            size="small"
            @click="openEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['telegram:superAdmin:delete']"
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
