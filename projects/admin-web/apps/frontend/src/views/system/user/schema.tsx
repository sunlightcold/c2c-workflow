import type { FormModalOptions } from '#/hooks';

import { getRolesApi } from '#/api/system';

type RoleOption = {
  label: string;
  value: number | string;
};

function buildRoleSelectRule(roleOptions: RoleOption[]) {
  return {
    type: 'select',
    title: '所属角色',
    field: 'roleIds',
    value: [],
    props: {
      mode: 'multiple',
      options: roleOptions,
    },
  };
}

function buildCreateUserRules(roleOptions: RoleOption[]) {
  return [
    {
      type: 'input',
      field: 'username',
      title: '用户名',
      value: '',
      col: {
        span: 11,
      },
      validate: [
        {
          required: true,
          message: '请输入用户名称',
          trigger: 'blur',
        },
      ],
    },
    {
      type: 'input',
      field: 'nickname',
      title: '昵称',
      value: '',
      col: {
        span: 12,
        offset: 1,
      },
      validate: [
        {
          required: true,
          message: '请输入昵称',
          trigger: 'blur',
        },
      ],
    },
    {
      type: 'radio',
      field: 'status',
      title: '用户状态',
      value: 1,
      col: {
        span: 24,
      },
      options: [
        { value: 0, label: '停用' },
        { value: 1, label: '启用' },
      ],
      validate: [
        {
          required: true,
          message: '请选择用户状态',
          trigger: 'blur',
        },
      ],
    },
    {
      type: 'input',
      field: 'password',
      title: '密码',
      value: '',
      col: {
        span: 24,
      },
      props: {
        type: 'password',
      },
      validate: [
        {
          required: true,
          message: '请输入密码',
          trigger: 'blur',
        },
      ],
    },
    buildRoleSelectRule(roleOptions),
    {
      type: 'input',
      field: 'description',
      title: '备注',
      value: '',
      col: {
        span: 24,
      },
    },
  ];
}

function buildEditUserRules(roleOptions: RoleOption[]) {
  return [
    {
      type: 'input',
      field: 'username',
      title: '用户名',
      value: '',
      col: {
        span: 11,
      },
      props: {
        disabled: true,
      },
    },
    {
      type: 'input',
      field: 'nickname',
      title: '昵称',
      value: '',
      col: {
        span: 12,
        offset: 1,
      },
      validate: [
        {
          required: true,
          message: '请输入昵称',
          trigger: 'blur',
        },
      ],
    },
    {
      type: 'radio',
      field: 'status',
      title: '用户状态',
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
          message: '请选择用户状态',
          trigger: 'blur',
        },
      ],
    },
    buildRoleSelectRule(roleOptions),
    {
      type: 'input',
      field: 'description',
      title: '备注',
      value: '',
      col: {
        span: 24,
      },
    },
  ];
}

function buildFormOption(
  roleOptions: RoleOption[],
  mode: 'create' | 'edit',
): NonNullable<FormModalOptions['formProps']> {
  return {
    option: {
      submitBtn: false,
      form: {
        layout: 'vertical' as const,
      },
      appendValue: false,
    },
    rule:
      mode === 'create'
        ? buildCreateUserRules(roleOptions)
        : buildEditUserRules(roleOptions),
  };
}

export function buildCreateUserModalOptions(
  roleOptions: RoleOption[],
): FormModalOptions {
  return {
    props: {
      title: '新增用户',
      centered: true,
    },
    formProps: buildFormOption(roleOptions, 'create'),
  };
}

export function buildEditUserModalOptions(
  roleOptions: RoleOption[],
): FormModalOptions {
  return {
    props: {
      title: '编辑用户',
      centered: true,
    },
    formProps: buildFormOption(roleOptions, 'edit'),
  };
}

export async function loadUserRoleOptions() {
  const data = await getRolesApi();
  return data.map((item) => ({ label: item.name, value: item.id }));
}
