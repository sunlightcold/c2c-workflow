import { describe, expect, it, vi } from 'vitest';

import {
  cancelMerchantOrderModalOptions,
  createMerchantOrderAppealModalOptions,
  createMerchantOrderPaymentModalOptions,
} from './business-form-schemas';

describe('merchant order operation forms', () => {
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
});
