import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { IpProxy } from '#/api/business/proxies';

import { z } from '#/adapter/form';
import { VxeUtils } from '#/utils';

import { formatBusinessTime } from '../shared/business-ui';

export const proxyProtocolOptions = ['http', 'https', 'socks5', 'socks5h'].map(
  (value) => ({ label: value.toUpperCase(), value }),
);

export const proxyStatusOptions = [
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
  { label: '已过期', value: 'expired' },
];

export function proxyColumns(
  fixedActions: boolean,
): VxeTableGridOptions<IpProxy>['columns'] {
  return [
    { type: 'checkbox', width: 50 },
    { field: 'name', title: '名称', minWidth: 150, sortable: true },
    VxeUtils.tag.getColumn<IpProxy>({
      column: { field: 'protocol', title: '协议', width: 100, sortable: true },
      cellValueMap: Object.fromEntries(
        proxyProtocolOptions.map(({ label, value }) => [value, label]),
      ),
    }),
    {
      field: 'address',
      title: '地址',
      minWidth: 190,
      slots: { default: 'address' },
    },
    { field: 'auth', title: '认证', minWidth: 140, slots: { default: 'auth' } },
    {
      field: 'location',
      title: '位置',
      minWidth: 130,
      showOverflow: false,
      slots: { default: 'location' },
    },
    {
      field: 'account_count',
      title: '账号数',
      width: 95,
      sortable: true,
      slots: { default: 'accounts' },
    },
    {
      field: 'latency',
      title: '延迟 / 质量',
      minWidth: 140,
      showOverflow: false,
      slots: { default: 'latency' },
    },
    {
      field: 'expires_at',
      title: '有效期',
      width: 140,
      sortable: true,
      slots: { default: 'expiry' },
    },
    {
      field: 'created_at',
      title: '创建时间',
      width: 180,
      sortable: true,
      formatter: ({ cellValue }) => formatBusinessTime(cellValue),
    },
    VxeUtils.tag.getColumn<IpProxy>({
      column: { field: 'status', title: '状态', width: 90, sortable: true },
      cellValueMap: { active: '启用', inactive: '停用', expired: '已过期' },
      colorMap: { active: 'success', inactive: 'default', expired: 'error' },
    }),
    {
      field: 'actions',
      title: '操作',
      width: 220,
      fixed: fixedActions ? 'right' : undefined,
      slots: { default: 'actions' },
    },
  ];
}

export function proxyFormSchema(editing: boolean): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'name',
      label: '名称',
      rules: z
        .string()
        .refine((value) => value.trim().length > 0, '请输入代理名称'),
      componentProps: { maxlength: 100, placeholder: '请输入代理名称' },
    },
    {
      component: 'Select',
      fieldName: 'protocol',
      label: '协议',
      rules: 'selectRequired',
      componentProps: { options: proxyProtocolOptions },
    },
    {
      component: 'Input',
      fieldName: 'host',
      label: '服务器',
      rules: z
        .string()
        .refine((value) => value.trim().length > 0, '请输入服务器'),
      componentProps: { maxlength: 255, placeholder: 'proxy.example.com' },
    },
    {
      component: 'InputNumber',
      fieldName: 'port',
      label: '端口',
      rules: 'selectRequired',
      componentProps: { min: 1, max: 65_535, precision: 0 },
    },
    {
      component: 'Input',
      fieldName: 'username',
      label: '用户名',
      componentProps: {
        maxlength: 255,
        autocomplete: 'off',
        placeholder: '可选',
      },
    },
    {
      component: 'InputPassword',
      fieldName: 'password',
      label: '密码',
      componentProps: {
        maxlength: 1024,
        autocomplete: 'new-password',
        placeholder: editing ? '留空保留原密码' : '可选',
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      dependencies: { if: () => editing, triggerFields: ['protocol'] },
      componentProps: {
        options: proxyStatusOptions.filter(({ value }) => value !== 'expired'),
        placeholder: '保留原启停状态',
      },
    },
    {
      component: 'Input',
      fieldName: 'date',
      label: '有效期',
      formItemClass: 'col-span-full',
    },
    {
      component: 'InputNumber',
      fieldName: 'expiry_warn_days',
      label: '到期提醒（天）',
      help: '在列表标记临近到期，不发送消息通知。',
      componentProps: { min: 0, max: 36_500, precision: 0 },
    },
    {
      component: 'Select',
      fieldName: 'fallback_mode',
      label: '到期策略',
      componentProps: {
        options: [
          { label: '不切换', value: 'none' },
          { label: '切换备用代理', value: 'proxy' },
          { label: '切换直连', value: 'direct' },
        ],
      },
    },
    {
      component: 'Select',
      fieldName: 'backup_proxy_id',
      label: '备用代理',
      formItemClass: 'col-span-full',
      dependencies: {
        if: (values) => values.fallback_mode === 'proxy',
        required: (values) => values.fallback_mode === 'proxy',
        triggerFields: ['fallback_mode'],
      },
      componentProps: {
        showSearch: true,
        optionFilterProp: 'label',
        options: [],
        placeholder: '请选择备用代理',
      },
    },
  ];
}
