import { describe, expect, it } from 'vitest';

import {
  createMerchantAccountModalOptions,
  createPaymentPlanModalOptions,
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
        'botCode',
        'autoAppealEnabled',
      ]),
    );
    expect(names).not.toEqual(
      expect.arrayContaining(['code', 'currency', 'timezone', 'riskLevel']),
    );
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
      ]),
    );
  });

  it('uses direct Binance and OKX credential fields', () => {
    const binance = fields(rotateMerchantCredentialModalOptions('BINANCE'));
    const okx = fields(rotateMerchantCredentialModalOptions('OKX'));
    expect(binance).toEqual(expect.arrayContaining(['apiKey', 'secretKey']));
    expect(okx).toEqual(
      expect.arrayContaining(['authorization', 'sessionCookie']),
    );
    expect([...binance, ...okx]).not.toContain('credentialRef');
  });

  it('renders payment plan forms above the merchant configuration drawer', () => {
    const routes = [
      { label: '主账号 · 支付宝批量有密', value: 'account:channel' },
    ];
    const create = createPaymentPlanModalOptions(routes);
    const edit = editPaymentPlanModalOptions(routes);

    expect(create.props.zIndex).toBeGreaterThan(1000);
    expect(edit.props.zIndex).toBe(create.props.zIndex);
    expect(edit.props.title).toBe('编辑支付方案');
    expect(fields(edit)).toEqual(['routeKey', 'priority', 'weight']);
  });
});
