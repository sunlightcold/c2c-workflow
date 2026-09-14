<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { MenuApi } from '#/api';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  createMenuApi,
  filterMenusApi,
  removeMenuApi,
  updateMenuApi,
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

import { loadMenuTreeData } from '../role/schema';
import {
  buildCreateMenuModalOptions,
  buildEditMenuModalOptions,
} from './schema';

interface RowType extends MenuApi.MenuData {}

const formOptions: VbenFormProps = {
  // 默认展开
  collapsed: false,
  schema: [
    {
      component: 'Input',
      fieldName: 'name',
      label: $t('page.menu.filterMenu'),
      componentProps: {
        placeholder: $t('page.menu.filterMenuTip'),
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
        placeholder: '请选择菜单状态',
      },
    },
    {
      component: 'Select',
      fieldName: 'type',
      label: '菜单类型',
      componentProps: {
        options: [
          { value: 'FOLDER', label: '目录' },
          { value: 'MENU', label: '菜单' },
          { value: 'PERMISSION', label: '权限' },
          { value: 'EMBED', label: '内嵌' },
        ],
        placeholder: '请选择菜单类型',
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
  checkboxConfig: {
    highlight: true,
    labelField: 'name',
  },
  treeConfig: {
    transform: true,
    rowField: 'id',
    reserve: true,
    parentField: 'parentId',
  },
  rowConfig: {
    keyField: 'id',
    resizable: true,
    isCurrent: true,
    isHover: true,
  },
  columns: [
    { field: 'treeIcon', width: 60, treeNode: true },
    {
      field: 'icon',
      title: '图标',
      width: 50,
      slots: {
        default(slotParams) {
          const fieldName = slotParams.column.field as keyof RowType;
          const cellValue = slotParams.row[fieldName] as string;
          return (
            <IconifyIcon class="inline-block text-[20px]" icon={cellValue} />
          );
        },
      },
    },
    { field: 'name', title: '菜单标题' },
    { field: 'orderNo', title: '排序编号' },
    { field: 'path', title: '路由地址' },
    { field: 'component', title: '组件地址' },
    { field: 'permission', title: '权限标识' },
    VxeUtils.tag.getColumn<RowType>({
      column: { field: 'type', title: '菜单类型' },
      cellValueMap: {
        FOLDER: '目录',
        MENU: '菜单',
        PERMISSION: '权限',
        EMBED: '内嵌',
      },
      colorMap: {
        FOLDER: AntColorVar.primary,
        MENU: AntColorVar.error,
        PERMISSION: AntColorVar.warning,
        EMBED: AntColorVar.success,
      },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'status', title: '菜单状态' },
      cellValueMap: { 0: '停用', 1: '启用' },
      colorMap: { 1: AntColorVar.primary, 0: AntColorVar.error },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'keepAlive', title: '缓存路由' },
      cellValueMap: { 0: '否', 1: '是' },
      colorMap: { 1: AntColorVar.primary, 0: AntColorVar.error },
    }),
    VxeUtils.tag.getColumn({
      column: { field: 'show', title: '显示' },
      cellValueMap: { 0: '否', 1: '是' },
      colorMap: { 1: AntColorVar.primary, 0: AntColorVar.error },
    }),
    { field: 'updatedAt', title: '更新时间', formatter: 'formatDateTime' },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 180,
      slots: { default: 'action' },
    },
  ],
  pagerConfig: {
    pageSize: 100,
    layouts: ['Total'],
  },
};

const [Grid, gApi] = useResourceGrid({
  formOptions,
  gridOptions,
  query: filterMenusApi,
});
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function onCreateClick(row?: Partial<RowType>) {
  const { treeMenus } = await loadMenuTreeData();
  const [fApi] = await formModalShow(buildCreateMenuModalOptions(treeMenus), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as MenuApi.MenuData;
        await runResourceAction({
          action: () => createMenuApi(data),
          onSuccess: async () => {
            await gApi.query();
            formModalClose();
          },
          successMessage: '新增成功',
        });
      });
    },
  });
  if (row) {
    fApi?.setValue({
      parentId: row.id,
      permission: row.permission,
    });
  }
}

async function onEdit(row: RowType) {
  const { treeMenus } = await loadMenuTreeData();
  const [fApi] = await formModalShow(buildEditMenuModalOptions(treeMenus), {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const data = api.formData() as MenuApi.MenuData;
        await runResourceAction({
          action: () => updateMenuApi(row.id, data),
          onSuccess: async () => {
            formModalClose();
            await gApi.query();
          },
          successMessage: '修改成功',
        });
      });
    },
  });
  fApi?.setValue(row);
}

function onRemove(row: RowType) {
  confirmResourceAction({
    action: () => removeMenuApi(row.id),
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
          v-access:code="['system:menu:create']"
          size="small"
          type="primary"
          @click="onCreateClick()"
        >
          新增
        </AButton>
      </template>

      <template #action="{ row }">
        <div
          class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
        >
          <AButton
            v-access:code="['system:menu:create']"
            class="px-1"
            size="small"
            type="link"
            @click="onCreateClick(row)"
          >
            新增
          </AButton>
          <AButton
            v-access:code="['system:menu:update']"
            class="px-1"
            size="small"
            type="link"
            @click="onEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['system:menu:delete']"
            class="px-1"
            size="small"
            type="link"
            danger
            @click="onRemove(row)"
          >
            删除
          </AButton>
        </div>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
