import type { Rule } from '@form-create/ant-design-vue';

import type { FormModalOptions } from '#/hooks';

import {
  BUSINESS_NESTED_MODAL_Z_INDEX,
  businessFormOption,
  businessModalProps,
  layoutBusinessFormRules,
} from '../shared/business-form-layout';
import {
  merchantPlatformApiBaseUrl,
  merchantPlatformOptions,
} from '../shared/business-ui';

type Platform = 'BINANCE' | 'OKX';
type SelectOption = { label: string; value: string };

export const DEFAULT_ORDER_CREATED_CHAT_MESSAGE = `您好，请确认本订单由您本人自主发起，所出售 USDT 为本人合法持有。

⚠️ 请使用您本人实名收款账户，原则上不接受亲友、公司、员工、客户或其他第三方账户代收。如需更换收款方式，请先联系本商家沟通确认。

同时请确认不存在代他人卖币、第三方代收或受他人委托变现等情况。如有任何信息不符或异常，请暂停交易并及时告知我们，感谢您的配合 🤝`;

export const DEFAULT_ORDER_PAID_CHAT_MESSAGE = `您好，我方已完成付款 ✅

请您登录核实收款账户实际到账情况，确认款项无误后，请及时释放 USDT。

感谢您的配合，祝交易顺利 🤝`;

export const DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE = `感谢您的信任与配合 ❤️ 本次交易已顺利完成！

如果这次交易体验让您满意，期待您给我们一个好评 ⭐️ 并关注本商家～

您的每一次认可都是我们持续做好服务的动力，期待下次还能继续为您服务 🤝`;

const required = (message: string) => [
  { message, required: true, trigger: 'blur' },
];
const binanceFields = ['apiKey', 'secretKey', 'clientType', 'xUserId'];
const okxFields = ['authorization', 'sessionCookie', 'signaturePrivateKey'];
const automationFields = [
  'automaticPaymentEnabled',
  'automaticPaymentExecutionMode',
  'c2cChatOrderCreatedEnabled',
  'c2cChatOrderCreatedMessage',
  'c2cChatOrderPaidEnabled',
  'c2cChatOrderPaidMessage',
  'c2cChatOrderCompletedEnabled',
  'c2cChatOrderCompletedMessage',
  'autoAppealEnabled',
  'autoAppealDelayMinutes',
];

function textRule(
  field: string,
  title: string,
  requiredMessage?: string,
): Rule {
  const textarea = title === '备注';
  return {
    field,
    props: {
      maxlength: textarea ? 500 : 128,
      ...(textarea ? { rows: 3, type: 'textarea' } : {}),
    },
    title,
    type: 'input',
    validate: requiredMessage ? required(requiredMessage) : undefined,
    value: '',
  };
}

function numberRule(
  field: string,
  title: string,
  value: number,
  min: number,
  max: number,
  step?: number,
): Rule {
  return {
    field,
    props: { max, min, step },
    title,
    type: 'inputNumber',
    value,
  };
}

function secretRule(field: string, title: string): Rule {
  return {
    field,
    props: { autocomplete: 'new-password', placeholder: `请输入 ${title}` },
    title,
    type: 'inputPassword',
    validate: required(`请输入 ${title}`),
    value: '',
  };
}

function settings(
  platform?: Platform,
  telegramGroupOptions?: SelectOption[],
): Rule[] {
  const hideAutomation = !platform;
  return [
    textRule('name', '账号名称', '请输入账号名称'),
    textRule('externalMerchantId', '平台商家编号', '请输入平台商家编号'),
    {
      ...textRule('apiBaseUrl', 'API 地址', '请输入平台 API 地址'),
      value: merchantPlatformApiBaseUrl(platform),
    },
    numberRule('pageSize', '每页同步笔数', 20, 1, 100),
    numberRule('overlapSeconds', '同步重叠秒数', 120, 0, 3600),
    {
      field: 'orderStatusList',
      options: [{ label: '待付款', value: 1 }],
      props: { mode: 'multiple', placeholder: '请选择同步订单状态' },
      title: '同步订单状态',
      type: 'select',
      validate: required('请选择同步订单状态'),
      value: [1],
    },
    numberRule(
      'requestTimeoutMs',
      '请求超时（毫秒）',
      15_000,
      1000,
      60_000,
      1000,
    ),
    numberRule(
      'paidConfirmIntervalMinMs',
      '付款确认最小间隔（毫秒）',
      platform === 'OKX' ? 2000 : 0,
      0,
      60_000,
      100,
    ),
    numberRule(
      'paidConfirmIntervalMaxMs',
      '付款确认最大间隔（毫秒）',
      platform === 'OKX' ? 3000 : 0,
      0,
      60_000,
      100,
    ),
    {
      field: 'automaticPaymentEnabled',
      hidden: hideAutomation,
      title: '自动支付',
      type: 'switch',
      value: false,
    },
    {
      field: 'automaticPaymentExecutionMode',
      hidden: hideAutomation,
      options: [
        { label: '支付宝商家转账', value: 'INSTANT' },
        { label: '支付宝批量有密', value: 'BATCH' },
      ],
      props: { allowClear: false, placeholder: '请选择支付方式' },
      title: '自动支付方式',
      type: 'select',
      validate: required('请选择自动支付方式'),
      value: 'INSTANT',
    },
    ...(telegramGroupOptions
      ? [
          {
            field: 'telegramGroupId',
            hidden: hideAutomation,
            options: telegramGroupOptions,
            props: {
              allowClear: true,
              disabled: telegramGroupOptions.length === 0,
              optionFilterProp: 'label',
              placeholder:
                telegramGroupOptions.length === 0
                  ? '暂无可绑定群组'
                  : '请选择机器人群组',
              showSearch: true,
            },
            title: '机器人群组',
            type: 'select',
            value: '',
          } satisfies Rule,
        ]
      : []),
    {
      field: 'c2cChatOrderCreatedEnabled',
      hidden: hideAutomation,
      title: '下单后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      ...textRule('c2cChatOrderCreatedMessage', '下单后消息'),
      hidden: hideAutomation,
      props: { maxlength: 500, rows: 3, showCount: true, type: 'textarea' },
      type: 'input',
      value: DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
    },
    {
      field: 'c2cChatOrderPaidEnabled',
      hidden: hideAutomation,
      title: '付款后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      ...textRule('c2cChatOrderPaidMessage', '付款后消息'),
      hidden: hideAutomation,
      props: { maxlength: 500, rows: 3, showCount: true, type: 'textarea' },
      type: 'input',
      value: DEFAULT_ORDER_PAID_CHAT_MESSAGE,
    },
    {
      field: 'c2cChatOrderCompletedEnabled',
      hidden: hideAutomation,
      title: '完成后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      ...textRule('c2cChatOrderCompletedMessage', '完成后消息'),
      hidden: hideAutomation,
      props: { maxlength: 500, rows: 3, showCount: true, type: 'textarea' },
      type: 'input',
      value: DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
    },
    {
      field: 'autoAppealEnabled',
      hidden: hideAutomation,
      title: '付款超时自动申诉',
      type: 'switch',
      value: false,
    },
    {
      ...numberRule(
        'autoAppealDelayMinutes',
        '付款后等待时间（分钟）',
        18,
        1,
        1440,
      ),
      hidden: hideAutomation,
    },
    textRule('description', '备注'),
  ];
}

export function createMerchantAccountModalOptions(
  platform?: Platform,
): FormModalOptions {
  const binance = platform === 'BINANCE';
  const okx = platform === 'OKX';
  return {
    props: businessModalProps('新增商家账号'),
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(
        [
          {
            field: 'platform',
            options: merchantPlatformOptions,
            title: '交易平台',
            type: 'select',
            update: (value, _rule, api, { origin }) => {
              if (origin !== 'change') return;
              const isBinance = value === 'BINANCE';
              const isOkx = value === 'OKX';
              api.hidden(!isBinance, binanceFields);
              api.hidden(!isOkx, okxFields);
              api.hidden(!isBinance && !isOkx, automationFields);
              if (isBinance || isOkx) {
                api.setValue(
                  'apiBaseUrl',
                  isBinance ? 'https://api.binance.com' : 'https://www.okx.com',
                );
                api.setValue('paidConfirmIntervalMinMs', isBinance ? 0 : 2000);
                api.setValue('paidConfirmIntervalMaxMs', isBinance ? 0 : 3000);
              }
            },
            validate: required('请选择交易平台'),
            value: platform ?? '',
          },
          { ...secretRule('apiKey', 'API Key'), hidden: !binance },
          { ...secretRule('secretKey', 'Secret Key'), hidden: !binance },
          {
            ...textRule('clientType', '客户端类型'),
            hidden: !binance,
            value: 'WEB',
          },
          { ...textRule('xUserId', 'X-User-ID'), hidden: !binance },
          { ...secretRule('authorization', 'Authorization'), hidden: !okx },
          { ...secretRule('sessionCookie', 'Cookie'), hidden: !okx },
          {
            ...secretRule('signaturePrivateKey', '签名私钥（PKCS#8 Base64）'),
            hidden: !okx,
          },
          ...settings(platform),
        ],
        [
          'apiBaseUrl',
          'apiKey',
          'authorization',
          'c2cChatOrderCompletedMessage',
          'c2cChatOrderCreatedMessage',
          'c2cChatOrderPaidMessage',
          'description',
          'orderStatusList',
          'secretKey',
          'sessionCookie',
          'signaturePrivateKey',
        ],
      ),
    },
  };
}

export function editMerchantAccountModalOptions(
  platform: Platform,
  telegramGroupOptions: SelectOption[] = [],
): FormModalOptions {
  return {
    props: businessModalProps('编辑商家账号'),
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(settings(platform, telegramGroupOptions), [
        'apiBaseUrl',
        'c2cChatOrderCompletedMessage',
        'c2cChatOrderCreatedMessage',
        'c2cChatOrderPaidMessage',
        'description',
        'orderStatusList',
      ]),
    },
  };
}

export function rotateMerchantCredentialModalOptions(
  platform: Platform,
): FormModalOptions {
  const rules =
    platform === 'BINANCE'
      ? [
          secretRule('apiKey', 'API Key'),
          secretRule('secretKey', 'Secret Key'),
          { ...textRule('clientType', '客户端类型'), value: 'WEB' },
          textRule('xUserId', 'X-User-ID'),
        ]
      : [
          secretRule('authorization', 'Authorization'),
          secretRule('sessionCookie', 'Cookie'),
          secretRule('signaturePrivateKey', '签名私钥（PKCS#8 Base64）'),
        ];
  return {
    props: businessModalProps('更新平台凭据', 680),
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(
        [
          ...rules,
          numberRule(
            'requestTimeoutMs',
            '请求超时（毫秒）',
            15_000,
            1000,
            60_000,
            1000,
          ),
        ],
        [
          'apiKey',
          'authorization',
          'secretKey',
          'sessionCookie',
          'signaturePrivateKey',
        ],
      ),
    },
  };
}

function paymentPlanModalOptions(
  title: string,
  routes: SelectOption[],
): FormModalOptions {
  return {
    props: {
      ...businessModalProps(title, 680),
      zIndex: BUSINESS_NESTED_MODAL_Z_INDEX,
    },
    formProps: {
      option: businessFormOption,
      rule: layoutBusinessFormRules(
        [
          {
            field: 'routeKey',
            options: routes,
            title: '支付账号与通道',
            type: 'select',
            validate: required('请选择支付账号与通道'),
            value: '',
          },
          numberRule('priority', '使用顺序', 100, 1, 1000),
          numberRule('weight', '分配比例', 100, 1, 100),
        ],
        ['routeKey'],
      ),
    },
  };
}

export function createPaymentPlanModalOptions(
  routes: SelectOption[],
): FormModalOptions {
  return paymentPlanModalOptions('新增支付方案', routes);
}

export function editPaymentPlanModalOptions(
  routes: SelectOption[],
): FormModalOptions {
  return paymentPlanModalOptions('编辑支付方案', routes);
}
