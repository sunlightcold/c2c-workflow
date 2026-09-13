import { describe, expect, it } from 'vitest';

import {
  businessFormOption,
  businessModalProps,
  layoutBusinessFormRules,
} from './business-form-layout';

describe('business form layout', () => {
  it('uses a responsive two-column grid with a mobile single-column fallback', () => {
    const [rule] = layoutBusinessFormRules([
      { field: 'name', title: '名称', type: 'input' },
    ]);

    expect(businessFormOption.row).toEqual({ gutter: 16 });
    expect(rule?.col).toEqual({ md: 12, xs: 24 });
  });

  it('keeps long or complex fields on a full row', () => {
    const [rule] = layoutBusinessFormRules(
      [{ field: 'description', title: '备注', type: 'textarea' }],
      ['description'],
    );

    expect(rule?.col).toEqual({ span: 24 });
  });

  it('constrains long forms to a scrollable modal body', () => {
    expect(businessModalProps('编辑商家账号')).toMatchObject({
      bodyStyle: {
        maxHeight: 'calc(100dvh - 180px)',
        overflowX: 'hidden',
        overflowY: 'auto',
      },
      width: 760,
      zIndex: 2000,
    });
  });
});
