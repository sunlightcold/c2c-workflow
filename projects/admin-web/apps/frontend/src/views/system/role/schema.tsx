import type { MenuApi } from '#/api';
import type { FormModalOptions } from '#/hooks';

import { cloneDeep } from 'lodash-es';

import { generateTreeRoutes, getMenusApi } from '#/api';

export async function loadMenuTreeData(params: Partial<MenuApi.MenuData> = {}) {
  const data = await getMenusApi(params);
  const treeMenus = generateTreeRoutes(data);
  return { menus: data, treeMenus };
}

function buildRoleTreeRule(treeMenus: ReturnType<typeof generateTreeRoutes>) {
  return {
    type: 'tree',
    title: '权限',
    field: 'menuIds',
    value: [],
    emit: ['check'],
    props: {
      blockNode: true,
      checkable: true,
      multiple: true,
      fieldNames: {
        key: 'id',
        title: 'name',
        children: 'children',
      },
      treeData: treeMenus,
    },
  };
}

function buildRoleFormOptions(
  treeMenus: ReturnType<typeof generateTreeRoutes>,
): NonNullable<FormModalOptions['formProps']> {
  return {
    option: {
      submitBtn: false,
      form: {
        layout: 'vertical' as const,
      },
      appendValue: false,
    },
    rule: [
      {
        type: 'input',
        field: 'name',
        title: '角色名称',
        value: '',
        col: {
          span: 11,
        },
        validate: [
          {
            required: true,
            message: '请输入角色名称',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'value',
        title: '角色标识',
        value: '',
        col: {
          span: 12,
          offset: 1,
        },
        validate: [
          {
            required: true,
            message: '请输入角色标识',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'radio',
        field: 'status',
        title: '角色状态',
        value: 1,
        col: {
          span: 24,
        },
        options: [
          { value: 0, label: '停用', disabled: false },
          { value: 1, label: '启用', disabled: false },
        ],
        validate: [
          {
            required: true,
            message: '请选择角色状态',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'description',
        title: '角色描述',
        value: '',
        props: {
          type: 'textarea',
          rows: 2,
        },
        col: {
          span: 24,
        },
      },
      buildRoleTreeRule(treeMenus),
    ],
  };
}

export function buildCreateRoleModalOptions(
  treeMenus: ReturnType<typeof generateTreeRoutes>,
): FormModalOptions {
  return {
    props: {
      title: '新增角色',
      centered: true,
    },
    formProps: buildRoleFormOptions(treeMenus),
  };
}

export function buildEditRoleModalOptions(
  treeMenus: ReturnType<typeof generateTreeRoutes>,
): FormModalOptions {
  const options = cloneDeep(buildCreateRoleModalOptions(treeMenus));
  options.props.title = '修改角色';
  return options;
}
