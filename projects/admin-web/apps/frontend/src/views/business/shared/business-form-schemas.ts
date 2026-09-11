import type { Api } from '@form-create/ant-design-vue';

import type { FormModalOptions } from '#/hooks';

import { merchantPlatformOptions } from './business-ui';

type SelectOption = { disabled?: boolean; label: string; value: string };

const verticalForm = {
  appendValue: false,
  form: { layout: 'vertical' as const },
  submitBtn: false,
};

const required = (message: string) => [
  { message, required: true, trigger: 'blur' },
];

const binanceCredentialFields = [
  'apiKey',
  'secretKey',
  'clientType',
  'xUserId',
];
const okxCredentialFields = ['authorization', 'sessionCookie'];
const binanceAutomationFields = [
  'botCode',
  'chatId',
  'c2cChatOrderCreatedEnabled',
  'c2cChatOrderCreatedMessage',
  'c2cChatOrderPaidEnabled',
  'c2cChatOrderPaidMessage',
  'c2cChatOrderCompletedEnabled',
  'c2cChatOrderCompletedMessage',
  'autoAppealEnabled',
  'autoAppealDelayMinutes',
];

const createdMessage =
  '您好，请确认本订单由您本人自主发起，所出售的数字资产为本人合法持有，并使用本人实名收款账户。';
const paidMessage =
  '您好，我方已完成付款，请核实收款账户实际到账情况，确认无误后及时放币。';
const completedMessage = '感谢您的配合，本次交易已顺利完成。';

function accountSettingRules(platform: 'BINANCE' | 'OKX') {
  const binanceOnly = platform !== 'BINANCE';
  return [
    {
      field: 'name',
      props: { maxlength: 100, placeholder: '请输入账号名称' },
      title: '账号名称',
      type: 'input',
      validate: required('请输入账号名称'),
      value: '',
    },
    {
      field: 'externalMerchantId',
      props: { maxlength: 128, placeholder: '请输入平台商家编号' },
      title: '平台商家编号',
      type: 'input',
      validate: required('请输入平台商家编号'),
      value: '',
    },
    {
      field: 'apiBaseUrl',
      props: { maxlength: 255, placeholder: '请输入平台 API 地址' },
      title: 'API 地址',
      type: 'input',
      validate: required('请输入平台 API 地址'),
      value:
        platform === 'BINANCE'
          ? 'https://api.binance.com'
          : 'https://www.okx.com',
    },
    {
      field: 'pageSize',
      props: { max: 100, min: 1 },
      title: '每页同步笔数',
      type: 'inputNumber',
      value: 20,
    },
    {
      field: 'overlapSeconds',
      props: { max: 3600, min: 0 },
      title: '同步重叠秒数',
      type: 'inputNumber',
      value: 120,
    },
    {
      field: 'orderStatusList',
      options: [{ label: '待付款', value: 1 }],
      props: { mode: 'multiple', placeholder: '请选择同步订单状态' },
      title: '同步订单状态',
      type: 'select',
      validate: required('请选择同步订单状态'),
      value: [1],
    },
    {
      field: 'requestTimeoutMs',
      props: { max: 60_000, min: 1000, step: 1000 },
      title: '请求超时（毫秒）',
      type: 'inputNumber',
      value: 15_000,
    },
    {
      field: 'paidConfirmIntervalMinMs',
      props: { max: 60_000, min: 0, step: 100 },
      title: '付款确认最小间隔（毫秒）',
      type: 'inputNumber',
      value: platform === 'OKX' ? 2000 : 0,
    },
    {
      field: 'paidConfirmIntervalMaxMs',
      props: { max: 60_000, min: 0, step: 100 },
      title: '付款确认最大间隔（毫秒）',
      type: 'inputNumber',
      value: platform === 'OKX' ? 3000 : 0,
    },
    {
      field: 'botCode',
      hidden: binanceOnly,
      props: { maxlength: 64, placeholder: '选填支付机器人编码' },
      title: '支付机器人编码',
      type: 'input',
      value: '',
    },
    {
      field: 'chatId',
      hidden: binanceOnly,
      props: { maxlength: 64, placeholder: '选填 Telegram 群组 ID' },
      title: 'Telegram 群组 ID',
      type: 'input',
      value: '',
    },
    {
      field: 'c2cChatOrderCreatedEnabled',
      hidden: binanceOnly,
      title: '下单后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      field: 'c2cChatOrderCreatedMessage',
      hidden: binanceOnly,
      props: { maxlength: 500, rows: 3, showCount: true },
      title: '下单后消息',
      type: 'textarea',
      value: createdMessage,
    },
    {
      field: 'c2cChatOrderPaidEnabled',
      hidden: binanceOnly,
      title: '付款后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      field: 'c2cChatOrderPaidMessage',
      hidden: binanceOnly,
      props: { maxlength: 500, rows: 3, showCount: true },
      title: '付款后消息',
      type: 'textarea',
      value: paidMessage,
    },
    {
      field: 'c2cChatOrderCompletedEnabled',
      hidden: binanceOnly,
      title: '完成后发送聊天消息',
      type: 'switch',
      value: false,
    },
    {
      field: 'c2cChatOrderCompletedMessage',
      hidden: binanceOnly,
      props: { maxlength: 500, rows: 3, showCount: true },
      title: '完成后消息',
      type: 'textarea',
      value: completedMessage,
    },
    {
      field: 'autoAppealEnabled',
      hidden: binanceOnly,
      title: '付款超时自动申诉',
      type: 'switch',
      value: false,
    },
    {
      field: 'autoAppealDelayMinutes',
      hidden: binanceOnly,
      props: { max: 1440, min: 1 },
      title: '付款后等待时间（分钟）',
      type: 'inputNumber',
      value: 18,
    },
    {
      field: 'description',
      props: { maxlength: 500, rows: 3, showCount: true },
      title: '备注',
      type: 'textarea',
      value: '',
    },
  ];
}

export function createMerchantAccountModalOptions(
  platform: 'BINANCE' | 'OKX' = 'BINANCE',
): FormModalOptions {
  const binanceOnly = platform !== 'BINANCE';
  return {
    props: { centered: true, title: '新增商家账号', width: 760 },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'code',
          props: { maxlength: 32, placeholder: '请输入账号编码' },
          title: '账号编码',
          type: 'input',
          validate: required('请输入账号编码'),
          value: '',
        },
        {
          field: 'platform',
          options: merchantPlatformOptions,
          props: { placeholder: '请选择交易平台' },
          title: '交易平台',
          type: 'select',
          update: (value, _rule, api, { origin }) => {
            if (origin !== 'change') return;
            const isBinance = value === 'BINANCE';
            api.hidden(!isBinance, binanceCredentialFields);
            api.hidden(isBinance, okxCredentialFields);
            api.hidden(!isBinance, binanceAutomationFields);
            api.setValue(
              'apiBaseUrl',
              isBinance ? 'https://api.binance.com' : 'https://www.okx.com',
            );
            api.setValue('paidConfirmIntervalMinMs', isBinance ? 0 : 2000);
            api.setValue('paidConfirmIntervalMaxMs', isBinance ? 0 : 3000);
          },
          validate: required('请选择交易平台'),
          value: platform,
        },
        {
          field: 'apiKey',
          hidden: binanceOnly,
          props: {
            autocomplete: 'new-password',
            placeholder: '请输入 API Key',
          },
          title: 'API Key',
          type: 'inputPassword',
          validate: required('请输入 API Key'),
          value: '',
        },
        {
          field: 'secretKey',
          hidden: binanceOnly,
          props: {
            autocomplete: 'new-password',
            placeholder: '请输入 Secret Key',
          },
          title: 'Secret Key',
          type: 'inputPassword',
          validate: required('请输入 Secret Key'),
          value: '',
        },
        {
          field: 'clientType',
          hidden: binanceOnly,
          props: { maxlength: 32 },
          title: '客户端类型',
          type: 'input',
          value: 'WEB',
        },
        {
          field: 'xUserId',
          hidden: binanceOnly,
          props: { maxlength: 64, placeholder: '接口要求时填写' },
          title: 'X-User-ID',
          type: 'input',
          value: '',
        },
        {
          field: 'authorization',
          hidden: platform !== 'OKX',
          props: {
            autocomplete: 'new-password',
            placeholder: '请输入 Authorization',
          },
          title: 'Authorization',
          type: 'inputPassword',
          validate: required('请输入 Authorization'),
          value: '',
        },
        {
          field: 'sessionCookie',
          hidden: platform !== 'OKX',
          props: { autocomplete: 'new-password', placeholder: '请输入 Cookie' },
          title: 'Cookie',
          type: 'inputPassword',
          validate: required('请输入 Cookie'),
          value: '',
        },
        ...accountSettingRules(platform),
      ],
    },
  };
}

export function editMerchantAccountModalOptions(
  platform: 'BINANCE' | 'OKX',
): FormModalOptions {
  return {
    props: { centered: true, title: '编辑商家账号', width: 760 },
    formProps: {
      option: verticalForm,
      rule: accountSettingRules(platform),
    },
  };
}

export function rotateMerchantCredentialModalOptions(
  platform: 'BINANCE' | 'OKX',
): FormModalOptions {
  const rules: NonNullable<FormModalOptions['formProps']>['rule'] = [];
  if (platform === 'BINANCE') {
    rules.push(
      {
        field: 'apiKey',
        props: { autocomplete: 'new-password', placeholder: '请输入 API Key' },
        title: 'API Key',
        type: 'inputPassword',
        validate: required('请输入 API Key'),
        value: '',
      },
      {
        field: 'secretKey',
        props: {
          autocomplete: 'new-password',
          placeholder: '请输入 Secret Key',
        },
        title: 'Secret Key',
        type: 'inputPassword',
        validate: required('请输入 Secret Key'),
        value: '',
      },
      {
        field: 'clientType',
        props: { maxlength: 32 },
        title: '客户端类型',
        type: 'input',
        value: 'WEB',
      },
      {
        field: 'xUserId',
        props: { maxlength: 128, placeholder: '选填' },
        title: 'X-User-ID',
        type: 'input',
        value: '',
      },
    );
  } else {
    rules.push(
      {
        field: 'authorization',
        props: {
          autocomplete: 'new-password',
          placeholder: '请输入 Authorization',
        },
        title: 'Authorization',
        type: 'inputPassword',
        validate: required('请输入 Authorization'),
        value: '',
      },
      {
        field: 'sessionCookie',
        props: { autocomplete: 'new-password', placeholder: '请输入 Cookie' },
        title: 'Cookie',
        type: 'inputPassword',
        validate: required('请输入 Cookie'),
        value: '',
      },
    );
  }
  rules.push({
    field: 'requestTimeoutMs',
    props: { max: 60_000, min: 1000 },
    title: '请求超时（毫秒）',
    type: 'inputNumber',
    value: 10_000,
  });
  return {
    props: { centered: true, title: '更新平台凭据', width: 620 },
    formProps: { option: verticalForm, rule: rules },
  };
}

export function createPaymentAccountModalOptions(
  platforms: SelectOption[],
): FormModalOptions {
  return {
    props: { centered: true, title: '新增支付账号' },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'name',
          props: { maxlength: 100, placeholder: '请输入账号名称' },
          title: '账号名称',
          type: 'input',
          validate: required('请输入账号名称'),
          value: '',
        },
        {
          field: 'code',
          props: { maxlength: 32, placeholder: '请输入账号编码' },
          title: '账号编码',
          type: 'input',
          validate: required('请输入账号编码'),
          value: '',
        },
        {
          field: 'platformId',
          options: platforms,
          props: { placeholder: '请选择支付平台' },
          title: '支付平台',
          type: 'select',
          validate: required('请选择支付平台'),
          value: platforms[0]?.value ?? '',
        },
        {
          field: 'externalAccountId',
          props: { maxlength: 128, placeholder: '请输入支付宝商户号' },
          title: '支付宝商户号',
          type: 'input',
          validate: required('请输入支付宝商户号'),
          value: '',
        },
        {
          field: 'credentialRef',
          props: {
            autocomplete: 'new-password',
            placeholder: '请输入 Secret 引用',
          },
          title: 'Secret 引用',
          type: 'inputPassword',
          validate: required('请输入 Secret 引用'),
          value: '',
        },
      ],
    },
  };
}

export function openPaymentChannelModalOptions(
  accountName: string,
  channels: SelectOption[],
): FormModalOptions {
  return {
    props: { centered: true, title: '开通支付通道' },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'accountName',
          props: { disabled: true },
          title: '支付账号',
          type: 'input',
          value: accountName,
        },
        {
          field: 'channelId',
          options: channels,
          props: { placeholder: '请选择该账号平台下的支付通道' },
          title: '支付通道',
          type: 'select',
          validate: required('请选择支付通道'),
          value: '',
        },
        {
          field: 'configRef',
          props: {
            autocomplete: 'new-password',
            placeholder: '没有独立配置时可留空',
          },
          title: '通道配置引用',
          type: 'inputPassword',
          value: '',
        },
      ],
    },
  };
}

export function createPaymentPlanModalOptions(
  routes: SelectOption[],
): FormModalOptions {
  return {
    props: { centered: true, title: '新增支付方案' },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'routeKey',
          options: routes,
          props: { placeholder: '请选择支付账号及其已开通通道' },
          title: '支付账号与通道',
          type: 'select',
          validate: required('请选择支付账号与通道'),
          value: '',
        },
        {
          field: 'priority',
          props: { max: 1000, min: 1 },
          title: '使用顺序',
          type: 'inputNumber',
          validate: required('请输入使用顺序'),
          value: 100,
        },
        {
          field: 'weight',
          props: { max: 100, min: 1 },
          title: '分配比例',
          type: 'inputNumber',
          validate: required('请输入分配比例'),
          value: 100,
        },
      ],
    },
  };
}

export function createManualPaymentModalOptions(
  merchants: SelectOption[],
): FormModalOptions {
  return {
    props: { centered: true, title: '新增手工支付' },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'merchantId',
          options: merchants,
          props: { placeholder: '请选择商家' },
          title: '商家',
          type: 'select',
          validate: required('请选择商家'),
          value: merchants[0]?.value ?? '',
        },
        {
          field: 'sourceBusinessNo',
          props: { maxlength: 128, placeholder: '请输入商户支付单号' },
          title: '商户支付单号',
          type: 'input',
          validate: required('请输入商户支付单号'),
          value: '',
        },
        {
          field: 'amount',
          props: { inputmode: 'decimal', placeholder: '例如 100.00' },
          title: '支付金额',
          type: 'input',
          validate: [
            ...required('请输入支付金额'),
            {
              message: '请输入大于零且最多两位小数的金额',
              pattern: /^(?:0\.(?:0[1-9]|[1-9]\d?)|[1-9]\d*(?:\.\d{1,2})?)$/,
              trigger: 'blur',
            },
          ],
          value: '',
        },
        {
          field: 'executionMode',
          options: [
            { label: '商家转账', value: 'INSTANT' },
            { label: '批量有密', value: 'BATCH' },
          ],
          title: '执行方式',
          type: 'radio',
          validate: required('请选择执行方式'),
          value: 'INSTANT',
        },
        {
          field: 'payeeName',
          props: { maxlength: 128, placeholder: '请输入收款人' },
          title: '收款人',
          type: 'input',
          validate: required('请输入收款人'),
          value: '',
        },
        {
          field: 'payeeIdentity',
          props: { maxlength: 256, placeholder: '请输入支付宝账号' },
          title: '支付宝账号',
          type: 'input',
          validate: required('请输入支付宝账号'),
          value: '',
        },
      ],
    },
  };
}

export interface PaymentBatchFormOptions {
  loadRoutes: (
    merchantId: string,
  ) => Promise<Array<SelectOption & { orders: SelectOption[] }>>;
  merchants: SelectOption[];
}

export function createPaymentBatchModalOptions({
  loadRoutes,
  merchants,
}: PaymentBatchFormOptions): FormModalOptions {
  const resetRouteFields = (api: Api) => {
    api.setValue('routeKey', '');
    api.setValue('paymentOrderIds', []);
  };
  return {
    props: { centered: true, title: '创建支付批次' },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'merchantId',
          options: merchants,
          props: { placeholder: '请选择商家' },
          title: '商家',
          type: 'select',
          update: (merchantId, _rule, api, { origin }) => {
            if (origin !== 'change') return;
            resetRouteFields(api);
            void loadRoutes(merchantId as string).then((routes) => {
              api.updateRule('routeKey', { options: routes });
            });
          },
          validate: required('请选择商家'),
          value: merchants[0]?.value ?? '',
        },
        {
          field: 'routeKey',
          options: [],
          props: { placeholder: '请选择同一支付账号与通道' },
          title: '支付账号与通道',
          type: 'select',
          update: (routeKey, rule, api, { origin }) => {
            if (origin !== 'change') return;
            api.setValue('paymentOrderIds', []);
            const route = (
              rule.options as Array<SelectOption & { orders: SelectOption[] }>
            ).find(({ value }) => value === routeKey);
            api.updateRule('paymentOrderIds', { options: route?.orders ?? [] });
          },
          validate: required('请选择支付账号与通道'),
          value: '',
        },
        {
          field: 'paymentOrderIds',
          options: [],
          props: {
            maxTagCount: 'responsive',
            mode: 'multiple',
            placeholder: '请选择 1 至 500 笔支付订单',
          },
          title: '待提交支付订单',
          type: 'select',
          validate: [
            {
              message: '请选择至少一笔支付订单',
              min: 1,
              required: true,
              trigger: 'change',
              type: 'array',
            },
          ],
          value: [],
        },
      ],
    },
  };
}

export function createMerchantOrderPaymentModalOptions(): FormModalOptions {
  return {
    props: { centered: true, title: '创建支付', width: 520 },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'executionMode',
          options: [
            { label: '支付宝商家转账', value: 'INSTANT' },
            { label: '支付宝批量有密', value: 'BATCH' },
          ],
          title: '支付方式',
          type: 'radio',
          validate: required('请选择支付方式'),
          value: 'INSTANT',
        },
      ],
    },
  };
}

export function cancelMerchantOrderModalOptions(): FormModalOptions {
  return {
    props: { centered: true, title: '作废商家订单', width: 520 },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'reason',
          props: {
            maxlength: 400,
            placeholder: '请输入作废原因',
            rows: 4,
            showCount: true,
          },
          title: '作废原因',
          type: 'textarea',
          validate: required('请输入作废原因'),
          value: '',
        },
      ],
    },
  };
}

export function createMerchantOrderAppealModalOptions(
  reasons: Array<{ reasonCode: number; reasonDesc: string }>,
  onReceipt: (file: File | undefined) => void,
): FormModalOptions {
  return {
    props: { centered: true, title: '提交订单申诉', width: 620 },
    formProps: {
      option: verticalForm,
      rule: [
        {
          field: 'reasonCode',
          options: reasons.map(({ reasonCode, reasonDesc }) => ({
            label: reasonDesc,
            value: reasonCode,
          })),
          props: { placeholder: '请选择币安实时返回的申诉原因' },
          title: '申诉原因',
          type: 'select',
          validate: required('请选择申诉原因'),
          value: reasons[0]?.reasonCode,
        },
        {
          field: 'description',
          props: {
            maxlength: 500,
            placeholder: '请说明已付款及卖家未放行的情况',
            rows: 4,
            showCount: true,
          },
          title: '申诉说明',
          type: 'textarea',
          validate: required('请输入申诉说明'),
          value: '',
        },
        {
          field: 'receipt',
          props: {
            accept: 'image/png,image/jpeg,image/webp',
            beforeUpload: (file: File) => {
              onReceipt(file);
              return false;
            },
            listType: 'picture',
            maxCount: 1,
          },
          on: { remove: () => onReceipt(undefined) },
          title: '付款回单',
          type: 'upload',
          validate: [
            {
              message: '请选择一张付款回单图片',
              min: 1,
              required: true,
              trigger: 'change',
              type: 'array',
            },
          ],
          value: [],
        },
      ],
    },
  };
}
