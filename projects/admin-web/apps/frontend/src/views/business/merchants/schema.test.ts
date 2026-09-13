import { describe, expect, it } from 'vitest';

import {
  createMerchantAccountModalOptions,
  createPaymentPlanModalOptions,
  DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
  DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
  DEFAULT_ORDER_PAID_CHAT_MESSAGE,
  editMerchantAccountModalOptions,
  editPaymentPlanModalOptions,
  rotateMerchantCredentialModalOptions,
} from './schema';

function fields(options: ReturnType<typeof createMerchantAccountModalOptions>) {
  return options.formProps?.rule?.map((rule) => rule.field) ?? [];
}

describe('merchant account form schemas', () => {
  it('uses responsive columns while keeping long settings on full rows', () => {
    const rules = createMerchantAccountModalOptions('BINANCE').formProps?.rule;

    expect(rules?.find(({ field }) => field === 'name')?.col).toEqual({
      md: 12,
      xs: 24,
    });
    expect(rules?.find(({ field }) => field === 'apiBaseUrl')?.col).toEqual({
      span: 24,
    });
    expect(
      rules?.find(({ field }) => field === 'c2cChatOrderCreatedMessage')?.col,
    ).toEqual({ span: 24 });
  });

  it('collects credentials and operational settings without unrelated fields', () => {
    const names = fields(createMerchantAccountModalOptions('BINANCE'));
    expect(names).toEqual(
      expect.arrayContaining([
        'platform',
        'apiKey',
        'secretKey',
        'pageSize',
        'overlapSeconds',
        'autoAppealEnabled',
      ]),
    );
    expect(names).not.toEqual(expect.arrayContaining(['botCode', 'chatId']));
    expect(names).not.toEqual(
      expect.arrayContaining(['code', 'currency', 'timezone', 'riskLevel']),
    );
  });

  it('uses the complete pfa-pay chat messages as form defaults', () => {
    const rules = createMerchantAccountModalOptions('BINANCE').formProps?.rule;
    const createdMessage = rules?.find(
      ({ field }) => field === 'c2cChatOrderCreatedMessage',
    );

    expect(createdMessage?.value).toBe(DEFAULT_ORDER_CREATED_CHAT_MESSAGE);
    expect(createdMessage).toMatchObject({
      props: { type: 'textarea' },
      type: 'input',
    });
    expect(
      rules?.find(({ field }) => field === 'c2cChatOrderPaidMessage')?.value,
    ).toBe(DEFAULT_ORDER_PAID_CHAT_MESSAGE);
    expect(
      rules?.find(({ field }) => field === 'c2cChatOrderCompletedMessage')
        ?.value,
    ).toBe(DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE);
    expect(DEFAULT_ORDER_CREATED_CHAT_MESSAGE).toContain(
      '原则上不接受亲友、公司、员工、客户或其他第三方账户代收',
    );
    expect(DEFAULT_ORDER_PAID_CHAT_MESSAGE).toContain(
      '请您登录核实收款账户实际到账情况',
    );
    expect(DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE).toContain(
      '您的每一次认可都是我们持续做好服务的动力',
    );
  });

  it('binds an existing merchant account through a searchable group selector', () => {
    const groupOptions = [
      { label: '总部支付群 · 总部支付机器人', value: 'group-1' },
    ];
    const rules = editMerchantAccountModalOptions('BINANCE', groupOptions)
      .formProps?.rule;
    const group = rules?.find(({ field }) => field === 'telegramGroupId');

    expect(rules?.map(({ field }) => field)).not.toEqual(
      expect.arrayContaining(['botCode', 'chatId']),
    );
    expect(group).toMatchObject({
      options: groupOptions,
      title: '机器人群组',
      type: 'select',
    });
    expect(group?.props).toMatchObject({
      allowClear: true,
      optionFilterProp: 'label',
      showSearch: true,
    });
  });

  it('supports robot groups and chat messages for OKX merchant accounts', () => {
    const rules = editMerchantAccountModalOptions('OKX', [
      { label: '欧易支付群 · 支付机器人', value: 'group-okx' },
    ]).formProps?.rule;

    expect(
      rules?.find(({ field }) => field === 'telegramGroupId')?.hidden,
    ).toBe(false);
    expect(
      rules?.find(({ field }) => field === 'c2cChatOrderCreatedMessage')
        ?.hidden,
    ).toBe(false);
    expect(
      rules?.find(({ field }) => field === 'automaticPaymentEnabled')?.hidden,
    ).toBe(false);
    expect(
      rules?.find(({ field }) => field === 'automaticPaymentExecutionMode')
        ?.options,
    ).toEqual([
      { label: '单笔付款（订单逐笔提交）', value: 'INSTANT' },
      { label: '批次付款（按批次策略提交）', value: 'BATCH' },
    ]);
  });

  it('does not preselect a platform for a new merchant account', () => {
    const platform = createMerchantAccountModalOptions().formProps?.rule?.find(
      (rule) => rule.field === 'platform',
    );

    expect(platform?.value).toBe('');
  });

  it('keeps platform and secrets out of editable account settings', () => {
    const names = fields(editMerchantAccountModalOptions('BINANCE'));
    expect(names).not.toEqual(
      expect.arrayContaining([
        'platform',
        'apiKey',
        'secretKey',
        'sessionCookie',
        'authorization',
        'signaturePrivateKey',
        'skipPaymentProofUpload',
      ]),
    );
  });

  it('uses direct Binance and OKX credential fields', () => {
    const binanceOptions = rotateMerchantCredentialModalOptions('BINANCE');
    const okxOptions = rotateMerchantCredentialModalOptions('OKX');
    const binance = fields(binanceOptions);
    const okx = fields(okxOptions);
    expect(binance).toEqual(expect.arrayContaining(['apiKey', 'secretKey']));
    expect(okx).toEqual(
      expect.arrayContaining([
        'authorization',
        'sessionCookie',
        'signaturePrivateKey',
        'skipPaymentProofUpload',
      ]),
    );
    expect([...binance, ...okx]).not.toContain('credentialRef');
    expect(binanceOptions.props.zIndex).toBeGreaterThan(1000);
    expect(okxOptions.props.zIndex).toBe(binanceOptions.props.zIndex);
  });

  it('renders payment plan forms above the merchant configuration drawer', () => {
    const routes = [
      {
        executionMode: 'BATCH' as const,
        label: '主账号 · 支付宝批量有密',
        value: 'account:channel',
      },
    ];
    const policies = [{ label: '常规批次', value: 'policy-1' }];
    const create = createPaymentPlanModalOptions(routes, policies);
    const edit = editPaymentPlanModalOptions(routes, policies);

    expect(create.props.zIndex).toBeGreaterThan(1000);
    expect(edit.props.zIndex).toBe(create.props.zIndex);
    expect(edit.props.title).toBe('编辑支付方案');
    expect(fields(edit)).toEqual([
      'routeKey',
      'batchPolicyId',
      'priority',
      'weight',
    ]);
  });
});
