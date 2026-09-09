import type { FormModalOptions } from '#/hooks';

import { IconPicker } from '@vben/common-ui';

import formCreate from '@form-create/ant-design-vue';
import { cloneDeep } from 'lodash-es';

formCreate.component('icon-picker', IconPicker);

type MenuTreeData = any[];

function buildMenuTreeSelectRule(treeMenus: MenuTreeData) {
  return {
    type: 'tree-select',
    field: 'parentId',
    title: '父级菜单',
    value: '',
    col: {
      span: 24,
    },
    props: {
      showSearch: true,
      fieldNames: {
        value: 'id',
        label: 'name',
        children: 'children',
      },
      allowClear: true,
      treeData: treeMenus,
    },
    validate: [],
  };
}

function buildMenuFormOptions(
  treeMenus: MenuTreeData,
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
      buildMenuTreeSelectRule(treeMenus),
      {
        type: 'input',
        field: 'name',
        title: '菜单标题',
        value: '',
        col: {
          span: 11,
        },
        validate: [
          {
            required: true,
            message: '请输入菜单标题',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input-number',
        field: 'orderNo',
        title: '排序标号',
        value: 0,
        col: {
          span: 12,
          offset: 1,
        },
        validate: [
          {
            required: true,
            message: '请输入排序标号',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'permission',
        title: '权限标识',
        value: '',
        col: {
          span: 11,
        },
        validate: [
          {
            required: true,
            message: '请输入权限标识',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'radio',
        field: 'status',
        title: '菜单状态',
        value: 1,
        col: {
          span: 12,
          offset: 1,
        },
        options: [
          { value: 1, label: '启用' },
          { value: 0, label: '停用' },
        ],
        validate: [
          {
            required: true,
            message: '请选择菜单状态',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'radio',
        field: 'show',
        title: '显示',
        value: 1,
        col: {
          span: 11,
        },
        options: [
          { value: 1, label: '显示' },
          { value: 0, label: '隐藏' },
        ],
        validate: [
          {
            required: true,
            message: '请选择显示状态',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'radio',
        field: 'type',
        title: '菜单类型',
        value: 1,
        col: {
          span: 12,
          offset: 1,
        },
        options: [
          { value: 'FOLDER', label: '目录' },
          { value: 'MENU', label: '菜单' },
          { value: 'PERMISSION', label: '权限' },
          { value: 'EMBED', label: '内嵌' },
        ],
        validate: [
          {
            required: true,
            message: '请选择菜单类型',
            trigger: 'blur',
          },
        ],
        control: [
          {
            value: 'MENU',
            rule: [
              {
                type: 'input',
                field: 'path',
                title: '路由地址',
                value: '',
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入路由地址',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'input',
                field: 'component',
                title: '组件地址',
                value: '',
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入组件地址',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'radio',
                field: 'keepAlive',
                title: '缓存路由',
                value: 1,
                col: {
                  span: 12,
                },
                options: [
                  { value: 1, label: '是' },
                  { value: 0, label: '否' },
                ],
                validate: [
                  {
                    required: true,
                    message: '请选择缓存路由状态',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'icon-picker',
                field: 'icon',
                title: '菜单图标',
                value: '',
                col: {
                  span: 12,
                },
                validate: [
                  {
                    required: true,
                    message: '请选择菜单图标',
                    trigger: 'blur',
                  },
                ],
              },
            ],
          },
          {
            value: 'FOLDER',
            rule: [
              {
                type: 'input',
                field: 'path',
                title: '路由地址',
                value: '',
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入路由地址',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'icon-picker',
                field: 'icon',
                title: '菜单图标',
                value: '',
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请选择菜单图标',
                    trigger: 'blur',
                  },
                ],
              },
            ],
          },
          {
            value: 'EMBED',
            rule: [
              {
                type: 'input',
                field: 'path',
                title: '路由地址',
                value: '',
                col: {
                  span: 11,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入路由地址',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'icon-picker',
                field: 'icon',
                title: '菜单图标',
                value: '',
                col: {
                  span: 12,
                  offset: 1,
                },
                validate: [
                  {
                    required: true,
                    message: '请选择菜单图标',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'input',
                field: 'iframeSrc',
                title: '链接地址',
                value: '',
                col: { span: 24 },
                validate: [
                  {
                    required: true,
                    message: '请输入链接地址',
                    trigger: 'blur',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

export function buildCreateMenuModalOptions(
  treeMenus: MenuTreeData,
): FormModalOptions {
  return {
    props: {
      title: '新增菜单',
      centered: true,
      width: '800px',
    },
    formProps: buildMenuFormOptions(treeMenus),
  };
}

export function buildEditMenuModalOptions(
  treeMenus: MenuTreeData,
): FormModalOptions {
  const options = cloneDeep(buildCreateMenuModalOptions(treeMenus));
  options.props.title = '修改菜单';
  return options;
}
