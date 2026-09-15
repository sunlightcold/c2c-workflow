import { describe, expect, it, vi } from 'vitest';

import {
  cancelMerchantOrderModalOptions,
  createManualPaymentModalOptions,
  createMerchantOrderAppealModalOptions,
  createPaymentAccountModalOptions,
  createPaymentBatchModalOptions,
  editPaymentAccountModalOptions,
  editPaymentChannelModalOptions,
  normalizeAlipayCredential,
  normalizeAlipayCredentialPatch,
  normalizePaymentChannelFormData,
  openPaymentChannelModalOptions,
} from './business-form-schemas';

describe('merchant order operation forms', () => {
  it('uses responsive columns and full rows for complex payment fields', () => {
    const account = createPaymentAccountModalOptions([
      { label: '支付宝', value: 'platform-1' },
    ]);
    const accountRules = account.formProps?.rule ?? [];
    const batchRules = createPaymentBatchModalOptions({
      loadRoutes: vi.fn().mockResolvedValue([]),
      merchants: [],
    }).formProps?.rule;
    const manualRules = createManualPaymentModalOptions([]).formProps?.rule;

    expect(accountRules.find(({ field }) => field === 'name')?.col).toEqual({
      md: 12,
      xs: 24,
    });
    expect(
      accountRules.find(({ field }) => field === 'privateKey')?.col,
    ).toEqual({ span: 24 });
    expect(
      batchRules?.find(({ field }) => field === 'paymentOrderIds')?.col,
    ).toEqual({ span: 24 });
    expect(manualRules?.find(({ field }) => field === 'amount')?.col).toEqual({
      md: 12,
      xs: 24,
    });
  });

  it('does not expose an internal code or preselect a payment platform', () => {
    const rules = createPaymentAccountModalOptions([
      { label: '支付宝', value: 'platform-1' },
    ]).formProps?.rule;

    expect(rules?.some(({ field }) => field === 'code')).toBe(false);
    expect(rules?.find(({ field }) => field === 'platformId')?.value).toBe('');
  });

  it('groups payment account identity and connection settings into two rows', () => {
    const rules =
      createPaymentAccountModalOptions([
        { label: '支付宝', value: 'platform-1' },
      ]).formProps?.rule ?? [];

    expect(rules.slice(0, 6).map(({ field }) => field)).toEqual([
      'name',
      'platformId',
      'externalAccountId',
      'appId',
      'authMode',
      'gateway',
    ]);
    for (const field of ['externalAccountId', 'appId', 'authMode']) {
      expect(rules.find((rule) => rule.field === field)?.col).toEqual({
        md: 12,
        xs: 24,
      });
    }
    expect(rules.find((rule) => rule.field === 'gateway')?.col).toEqual({
      span: 24,
    });
  });

  it('requires an audit reason when cancelling a merchant order', () => {
    const rule = cancelMerchantOrderModalOptions().formProps?.rule?.find(
      ({ field }) => field === 'reason',
    );

    expect(rule?.validate).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ required: true, trigger: 'blur' }),
      ]),
    );
  });

  it('maps live appeal reasons without adding an unnecessary receipt display', () => {
    const options = createMerchantOrderAppealModalOptions([
      { reasonCode: 6, reasonDesc: '卖家收款后未放行' },
    ]);
    const reason = options.formProps?.rule?.find(
      ({ field }) => field === 'reasonCode',
    );

    expect(reason?.options).toEqual([{ label: '卖家收款后未放行', value: 6 }]);
    expect(
      options.formProps?.rule?.some(({ field }) => field === 'receiptHandling'),
    ).toBe(false);
    expect(
      options.formProps?.rule?.some(({ field }) => field === 'receipt'),
    ).toBe(false);
  });

  it('combines payment account identity and its one credential in editing', () => {
    const options = editPaymentAccountModalOptions('KEY');
    const fields = options.formProps?.rule?.map(({ field }) => field) ?? [];

    expect(fields).toEqual(
      expect.arrayContaining([
        'name',
        'externalAccountId',
        'authMode',
        'appId',
        'gateway',
        'privateKey',
        'alipayPublicKey',
        'appCertContent',
        'alipayPublicCertContent',
        'alipayRootCertContent',
      ]),
    );
    const rules = options.formProps?.rule ?? [];
    expect(fields.some((field) => String(field).endsWith('File'))).toBe(false);
    expect(rules.find(({ field }) => field === 'privateKey')).toMatchObject({
      col: { span: 24 },
      type: 'credentialTextFileInput',
    });
    expect(
      rules.find(({ field }) => field === 'alipayPublicKey'),
    ).toMatchObject({
      col: { md: 12, xs: 24 },
      hidden: false,
      type: 'credentialTextFileInput',
    });
    expect(rules.find(({ field }) => field === 'appCertContent')).toMatchObject(
      {
        hidden: true,
        props: {
          accept: '.crt,.cer,.pem,.der',
          contentKind: 'certificate',
        },
        type: 'credentialTextFileInput',
      },
    );
    expect(rules.find(({ field }) => field === 'authMode')?.options).toEqual([
      { label: '公钥模式', value: 'KEY' },
      { label: '证书模式', value: 'CERT' },
    ]);
    expect(rules.find(({ field }) => field === 'gateway')).toMatchObject({
      title: 'API 网关地址',
      type: 'input',
      value: expect.any(String),
    });
    expect(
      rules.find(({ field }) => field === 'gateway')?.options,
    ).toBeUndefined();
    expect(
      rules.find(({ field }) => field === 'privateKey')?.validate,
    ).toBeUndefined();
  });

  it('submits only the credential fields used by the selected mode', () => {
    const common = {
      alipayPublicCertContent: 'stale-public-cert',
      alipayPublicKey: 'alipay-public-key',
      alipayRootCertContent: 'stale-root-cert',
      appCertContent: 'stale-app-cert',
      appId: '2026000000000001',
      authMode: 'KEY' as const,
      gateway: 'https://openapi.alipay.com/gateway.do',
      privateKey: 'application-private-key',
    };

    expect(normalizeAlipayCredential(common)).toEqual({
      alipayPublicKey: 'alipay-public-key',
      appId: '2026000000000001',
      authMode: 'KEY',
      gateway: 'https://openapi.alipay.com/gateway.do',
      privateKey: 'application-private-key',
    });
  });

  it('omits empty write-only credential values while editing', () => {
    expect(
      normalizeAlipayCredentialPatch({
        alipayPublicKey: '',
        appId: '2026000000000001',
        authMode: 'KEY',
        gateway: 'https://openapi.alipay.com/gateway.do',
        privateKey: '',
      }),
    ).toEqual({
      appId: '2026000000000001',
      authMode: 'KEY',
      gateway: 'https://openapi.alipay.com/gateway.do',
    });
  });

  it('maps cleared channel limits to null', () => {
    expect(
      normalizePaymentChannelFormData({
        maximumAmount: ' ',
        minimumAmount: '',
      }),
    ).toEqual({
      maximumAmount: null,
      minimumAmount: null,
    });
  });

  it.each([
    ['open', openPaymentChannelModalOptions('主账号', [])],
    ['edit', editPaymentChannelModalOptions('支付宝批量有密')],
  ])(
    'captures only the amount range when configuring a channel: %s',
    (_, options) => {
      const fields = options.formProps?.rule?.map(({ field }) => field);

      expect(fields).toEqual(
        expect.arrayContaining(['minimumAmount', 'maximumAmount']),
      );
      expect(fields).not.toContain('concurrencyLimit');
    },
  );

  it.each([
    ['open', openPaymentChannelModalOptions('主账号', [])],
    ['edit', editPaymentChannelModalOptions('支付宝批量有密')],
  ])('places the nested channel modal above its drawer: %s', (_, options) => {
    expect(options.props?.zIndex).toBe(2100);
  });
});
