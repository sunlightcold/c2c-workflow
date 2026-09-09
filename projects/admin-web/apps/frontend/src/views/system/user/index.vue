<script lang="tsx" setup>
import type { UserInfo } from '@vben/types';

import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { UserApi } from '#/api';

import { Page } from '@vben/common-ui';

import {
  createUserApi,
  filterUsersApi,
  removeUserApi,
  updateUserApi,
} from '#/api';
import { AntColorVar } from '#/constants';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';
import { $t } from '#/locales';
import { VxeUtils } from '#/utils';

import {
  buildCreateUserModalOptions,
  buildEditUserModalOptions,
  loadUserRoleOptions,
} from './schema';

interface RowType extends UserApi.UserData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'username',
      label: $t('page.user.filterUsername'),
      componentProps: {
        placeholder: $t('page.user.filterUsernameTip'),
      },
    },
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'nickname',
      label: '用户昵称',
      componentProps: {
        placeholder: '请输入用户昵称',
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        options: [
          { value: 0, label: '停用' },
          { value: 1, label: '启用' },
        ],
        placeholder: '请选择用户状态',
      },
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: $t('page.user.filterRemark'),
      componentProps: {
        placeholder: $t('page.user.filterRemarkTip'),
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
    { field: 'username', title: '用户名', width: 150 },
    { field: 'nickname', title: '昵称', width: 200 },
    { field: 'avatar', title: '头像', width: 120 },
    VxeUtils.tags.getColumn({
      column: {
        field: 'roles',
        title: '所属角色',
        align: 'center',
        width: 200,
      },
      props: { color: 'blue' },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'status', title: '状态', width: 120 },
      cellValueMap: { 0: '停用', 1: '启用' },
      colorMap: { 0: AntColorVar.error, 1: AntColorVar.primary },
    }),
    { field: 'description', title: '备注' },
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
  query: filterUsersApi,
});
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function onCreateClick() {
  const roleOptions = await loadUserRoleOptions();
  formModalShow(buildCreateUserModalOptions(roleOptions), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as UserInfo;
        await runResourceAction({
          action: () => createUserApi(data),
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
  const roleOptions = await loadUserRoleOptions();
  const [fApi] = await formModalShow(buildEditUserModalOptions(roleOptions), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as UserInfo;
        await runResourceAction({
          action: () => updateUserApi(row.id, data),
          onSuccess: async () => {
            formModalClose();
            await gApi.query();
          },
          successMessage: '修改成功',
        });
      });
    },
  });
  const roleIds = row.roles.map((item) => item.id);
  fApi?.setValue({ ...row, roleIds });
}

function onRemove(row: RowType) {
  confirmResourceAction({
    action: () => removeUserApi(row.id),
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
          v-access:code="['system:user:create']"
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
            v-access:code="['system:user:update']"
            size="small"
            type="default"
            @click="onEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['system:user:delete']"
            size="small"
            danger
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
