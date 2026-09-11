import { describe, expect, it, vi } from 'vitest';

import {
  cancelMerchantOrderModalOptions,
  createManualPaymentModalOptions,
  createMerchantOrderAppealModalOptions,
  createMerchantOrderPaymentModalOptions,
  createPaymentAccountModalOptions,
  createPaymentBatchModalOptions,
  editPaymentAccountModalOptions,
  editPaymentChannelModalOptions,
  normalizeAlipayCredential,
  normalizePaymentChannelFormData,
  openPaymentChannelModalOptions,
  paymentAccountCredentialModalOptions,
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
    ).toEqual({
      md: 12,
      xs: 24,
    });
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
    for (const field of ['externalAccountId', 'appId', 'authMode', 'gateway']) {
      expect(rules.find((rule) => rule.field === field)?.col).toEqual({
        md: 12,
        xs: 24,
      });
    }
  });

  it('offers only the two implemented Alipay execution modes', () => {
    const rule = createMerchantOrderPaymentModalOptions().formProps?.rule?.find(
      ({ field }) => field === 'executionMode',
    );

    expect(rule?.options).toEqual([
      { label: '支付宝商家转账', value: 'INSTANT' },
      { label: '支付宝批量有密', value: 'BATCH' },
    ]);
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

  it('maps live appeal reasons and captures one receipt without auto-uploading it', () => {
    const onReceipt = vi.fn();
    const options = createMerchantOrderAppealModalOptions(
      [{ reasonCode: 6, reasonDesc: '卖家收款后未放行' }],
      onReceipt,
    );
    const reason = options.formProps?.rule?.find(
      ({ field }) => field === 'reasonCode',
    );
    const receipt = options.formProps?.rule?.find(
      ({ field }) => field === 'receipt',
    );
    const file = new File(['receipt'], 'receipt.png', { type: 'image/png' });

    expect(reason?.options).toEqual([{ label: '卖家收款后未放行', value: 6 }]);
    expect(receipt?.props).toMatchObject({
      accept: 'image/png,image/jpeg,image/webp',
      maxCount: 1,
    });
    expect((receipt?.props as any).beforeUpload(file)).toBe(false);
    expect(onReceipt).toHaveBeenCalledWith(file);
  });

  it('keeps basic payment account editing separate from credentials', () => {
    const options = editPaymentAccountModalOptions();
    const fields = options.formProps?.rule?.map(({ field }) => field);

    expect(fields).toEqual(['name', 'externalAccountId']);
  });

  it('offers key and certificate modes for the one account credential', () => {
    const options = paymentAccountCredentialModalOptions('KEY');
    const rules = options.formProps?.rule ?? [];
    const fields = rules.map(({ field }) => field);

    expect(fields).toEqual(
      expect.arrayContaining([
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
    expect(fields.some((field) => String(field).endsWith('File'))).toBe(false);
    expect(rules.find(({ field }) => field === 'privateKey')).toMatchObject({
      col: { md: 12, xs: 24 },
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
      value: 'https://openapi.alipay.com/gateway.do',
    });
    expect(
      rules.find(({ field }) => field === 'gateway')?.options,
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

  it('maps cleared channel limits to null', () => {
    expect(
      normalizePaymentChannelFormData({
        concurrencyLimit: 3,
        maximumAmount: ' ',
        minimumAmount: '',
      }),
    ).toEqual({
      concurrencyLimit: 3,
      maximumAmount: null,
      minimumAmount: null,
    });
  });

  it.each([
    ['open', openPaymentChannelModalOptions('主账号', [])],
    ['edit', editPaymentChannelModalOptions('支付宝批量有密')],
  ])(
    'captures amount range and concurrency when configuring a channel: %s',
    (_, options) => {
      const fields = options.formProps?.rule?.map(({ field }) => field);

      expect(fields).toEqual(
        expect.arrayContaining([
          'minimumAmount',
          'maximumAmount',
          'concurrencyLimit',
        ]),
      );
    },
  );

  it.each([
    ['open', openPaymentChannelModalOptions('主账号', [])],
    ['edit', editPaymentChannelModalOptions('支付宝批量有密')],
  ])('places the nested channel modal above its drawer: %s', (_, options) => {
    expect(options.props?.zIndex).toBe(2100);
  });
});
