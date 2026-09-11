import type { Options, Rule } from '@form-create/ant-design-vue';

import type { FormModalOptions } from '#/hooks';

const halfWidthCol = { md: 12, xs: 24 } as const;
const fullWidthCol = { span: 24 } as const;

export const businessFormOption: Options = {
  appendValue: false,
  form: { layout: 'vertical' },
  row: { gutter: 16 },
  submitBtn: false,
};

export function businessModalProps(
  title: string,
  width = 760,
): FormModalOptions['props'] {
  return {
    bodyStyle: {
      maxHeight: 'calc(100dvh - 180px)',
      overflowY: 'auto',
    },
    centered: true,
    title,
    width,
  };
}

export function layoutBusinessFormRules(
  rules: Rule[],
  fullWidthFields: readonly string[] = [],
): Rule[] {
  const fullWidth = new Set(fullWidthFields);
  return rules.map((rule) => ({
    ...rule,
    col:
      rule.col ??
      (fullWidth.has(String(rule.field)) ? fullWidthCol : halfWidthCol),
  }));
}
