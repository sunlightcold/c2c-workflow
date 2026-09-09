import type { FormModalOptions } from '#/hooks';

import { cloneDeep } from 'lodash-es';

export const createModalOptions: FormModalOptions = {
  props: {
    title: '新增任务',
    centered: true,
    width: 800,
  },
  formProps: {
    rule: [
      {
        type: 'radio',
        field: 'type',
        title: '任务类型',
        value: 'Cron',
        col: {
          span: 24,
        },
        options: [
          { value: 'Cron', label: 'Cron' },
          { value: 'Interval', label: '时间间隔' },
        ],
        validate: [
          {
            required: true,
            message: '请选择任务类型',
            trigger: 'blur',
          },
        ],
        control: [
          {
            value: 'Cron',
            rule: [
              {
                type: 'input',
                field: 'cron',
                title: 'Cron',
                value: '',
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入Corn表达式',
                    trigger: 'blur',
                  },
                ],
              },
              {
                type: 'DatePicker',
                field: 'startedAt',
                title: '开始时间',
                value: undefined,
                props: {
                  showTime: true,
                },
                col: {
                  span: 12,
                },
                wrap: {
                  labelCol: { span: 6 },
                  wrapperCol: { span: 18 },
                },
              },
              {
                type: 'DatePicker',
                field: 'endedAt',
                title: '结束时间',
                value: undefined,
                props: {
                  showTime: true,
                },
                col: {
                  span: 12,
                },
                wrap: {
                  labelCol: { span: 6 },
                  wrapperCol: { span: 18 },
                },
              },
            ],
          },
          {
            value: 'Interval',
            rule: [
              {
                type: 'inputNumber',
                field: 'every',
                title: '执行间隔',
                value: 60_000,
                col: {
                  span: 24,
                },
                validate: [
                  {
                    required: true,
                    message: '请输入执行间隔',
                    trigger: 'blur',
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'input',
        field: 'name',
        title: '任务名称',
        value: '',
        col: {
          span: 24,
        },
        validate: [
          {
            required: true,
            message: '请输入任务名称',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'service',
        title: '服务路径',
        value: '',
        col: {
          span: 24,
        },
        validate: [
          {
            required: true,
            message: '请输入服务路径',
            trigger: 'blur',
          },
        ],
      },
      {
        type: 'input',
        field: 'data',
        title: '服务参数',
        value: '',
        props: {
          type: 'textarea',
          rows: 2,
        },
        col: {
          span: 24,
        },
      },
      {
        type: 'inputNumber',
        field: 'limit',
        title: '执行次数',
        value: -1,
        col: {
          span: 12,
        },
        wrap: {
          labelCol: { span: 6 },
          wrapperCol: { span: 18 },
        },
      },
      {
        type: 'radio',
        field: 'status',
        title: '任务状态',
        value: 1,
        col: {
          span: 12,
        },
        options: [
          { value: 1, label: '运行' },
          { value: 0, label: '停止' },
        ],
        validate: [
          {
            required: true,
            message: '请选择任务状态',
            trigger: 'blur',
          },
        ],
        wrap: {
          labelCol: { span: 6 },
          wrapperCol: { span: 18 },
        },
      },
      {
        type: 'input',
        field: 'description',
        title: '描述',
        value: '',
        props: {
          type: 'textarea',
          rows: 2,
        },
        col: {
          span: 24,
        },
      },
    ],
    option: {
      submitBtn: false,
      form: {
        layout: 'horizontal',
      },
      appendValue: false,
    },
  },
};

export const editModalOptions: FormModalOptions = {
  ...cloneDeep(createModalOptions),
  props: {
    ...createModalOptions.props,
    title: '修改任务',
  },
};
