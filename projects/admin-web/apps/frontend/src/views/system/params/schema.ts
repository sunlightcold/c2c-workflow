import type { FormModalOptions } from '#/hooks';

import { cloneDeep } from 'lodash-es';

import { ParamsTypeOptions } from '#/constants';

export const createModalOptions: FormModalOptions = {
  props: {
    title: '新增参数',
    centered: true,
  },
  formProps: {
    rule: [
      {
        type: 'input',
        field: 'name',
        title: '参数名',
        value: '',
        col: { span: 11 },
        validate: [
          { required: true, message: '请输入参数名', trigger: 'blur' },
        ],
      },
      {
        type: 'input',
        field: 'key',
        title: '参数键名',
        value: '',
        col: { span: 12, offset: 1 },
        validate: [
          { required: true, message: '请输入参数键名', trigger: 'blur' },
        ],
      },
      {
        type: 'input',
        field: 'value',
        title: '参数值',
        value: '',
        col: { span: 11 },
        validate: [
          { required: true, message: '请输入参数值', trigger: 'blur' },
        ],
      },
      {
        type: 'radio',
        field: 'type',
        title: '参数类型',
        col: { span: 12, offset: 1 },
        options: ParamsTypeOptions,
        validate: [
          { required: true, message: '请选择参数类型', trigger: 'blur' },
        ],
      },
      {
        type: 'input',
        field: 'description',
        title: '描述',
        value: '',
        props: { type: 'textarea', rows: 2 },
        col: { span: 24 },
      },
    ],
    option: {
      submitBtn: false,
      form: { layout: 'vertical' },
      appendValue: false,
    },
  },
};

export const editModalOptions: FormModalOptions = {
  ...cloneDeep(createModalOptions),
  props: {
    ...createModalOptions.props,
    title: '修改参数',
  },
};
editModalOptions.formProps?.rule?.push({
  type: 'input',
  field: '_id',
  title: 'ID',
  value: '',
  hidden: true,
});
