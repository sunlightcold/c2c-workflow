import { describe, expect, it } from 'vitest';

import {
  createMerchantAccountModalOptions,
  editMerchantAccountModalOptions,
  rotateMerchantCredentialModalOptions,
} from './schema';

function fields(options: ReturnType<typeof createMerchantAccountModalOptions>) {
  return options.formProps?.rule?.map((rule) => rule.field) ?? [];
}

describe('merchant account form schemas', () => {
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
      expect.arrayContaining(['currency', 'timezone', 'riskLevel']),
    );
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
});
