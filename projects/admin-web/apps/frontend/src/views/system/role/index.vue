<script lang="tsx" setup>
import type { Api } from '@form-create/ant-design-vue';

import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { MenuApi, RoleApi } from '#/api';

import { Page } from '@vben/common-ui';

import {
  createRoleApi,
  filterRolesApi,
  getRoleApi,
  removeRoleApi,
  updateRoleApi,
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
  buildCreateRoleModalOptions,
  buildEditRoleModalOptions,
  loadMenuTreeData,
} from './schema';

interface RowType extends RoleApi.RoleData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'name',
      label: $t('page.role.filterRolename'),
      componentProps: {
        placeholder: $t('page.role.filterRolenameTip'),
      },
    },
    {
      component: 'Input',
      defaultValue: '',
      fieldName: 'value',
      label: $t('page.role.filterRole'),
      componentProps: {
        placeholder: $t('page.role.filterRoleTip'),
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        allowClear: true,
        options: [
          { value: 0, label: '停用' },
          { value: 1, label: '启用' },
        ],
        placeholder: '请选择角色状态',
      },
    },
    {
      component: 'Input',
      fieldName: 'description',
      label: $t('page.role.filterRemark'),
      componentProps: {
        placeholder: $t('page.role.filterRemarkTip'),
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
    { field: 'value', title: '角色标识', width: 150 },
    { field: 'name', title: '角色名称', width: 200 },
    VxeUtils.tag.getColumn({
      column: { field: 'status', title: '状态', width: 120 },
      cellValueMap: { 0: '停用', 1: '启用' },
      colorMap: { 0: AntColorVar.error, 1: AntColorVar.primary },
      props: { color: AntColorVar.primary },
    }),
    { field: 'description', title: '描述', align: 'left' },
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
  query: filterRolesApi,
});
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function onCreateClick() {
  const menuData = await loadMenuTreeData();
  const { treeMenus } = menuData;
  formModalShow(buildCreateRoleModalOptions(treeMenus), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as RoleApi.RoleData;
        getFullTreeHalfAndCheckedKeys(api, data);
        await runResourceAction({
          action: () => createRoleApi(data),
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
  const menuData = await loadMenuTreeData();
  const { treeMenus } = menuData;
  const [fApi] = await formModalShow(buildEditRoleModalOptions(treeMenus), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as RoleApi.RoleData;
        getFullTreeHalfAndCheckedKeys(api, data);
        await runResourceAction({
          action: () => updateRoleApi(row.id, data),
          onSuccess: async () => {
            formModalClose();
            await gApi.query();
          },
          successMessage: '修改成功',
        });
      });
    },
  });
  const roleInfo = await getRoleApi(row.id);
  excludeFullTreeParentIds(roleInfo, menuData.menus);
  fApi?.setValue(roleInfo);
}

function onRemove(row: RowType) {
  confirmResourceAction({
    action: () => removeRoleApi(row.id),
    onSuccess: () => gApi.query(),
    successMessage: '删除成功',
    title: '确认删除吗?',
  });
}

/**
 * 通过表单无法获取到树组件 half 状态的树节点，需要此方法 hack，会修改 data 的值存在副作用
 */
function getFullTreeHalfAndCheckedKeys(
  api: Api,
  data: RoleApi.CreateRoleParams,
) {
  const vm = api.el('menuIds');
  const halfCheckedKeys = vm.halfCheckedKeys;
  const checkedKeys = vm.checkedKeys;
  const menuIds = [...halfCheckedKeys, ...checkedKeys];
  data.menuIds = menuIds;
}

/**
 * 设置表单数据时树组件不能把父节点的id带上，会导致子节点全部被选中，需要此方法 hack，会修改 data 的值存在副作用
 */
function excludeFullTreeParentIds(
  data: RoleApi.RoleInfoData,
  menus: MenuApi.MenuData[],
) {
  const menuIds = data.menuIds ?? [];
  const targetMenuIds: string[] = [];
  const parentMenuSet = new Set<string>();
  for (const menu of menus) {
    if (menu.parentId) {
      parentMenuSet.add(menu.parentId);
    }
  }
  for (const id of menuIds) {
    if (!parentMenuSet.has(id)) {
      targetMenuIds.push(id);
    }
  }
  data.menuIds = targetMenuIds;
  return data;
}
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['system:role:create']"
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
            v-access:code="['system:role:update']"
            size="small"
            type="default"
            @click="onEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['system:role:delete']"
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
