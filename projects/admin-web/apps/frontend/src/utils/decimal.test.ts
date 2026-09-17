import { describe, expect, it } from 'vitest';

import { decimalToChartNumber, formatCny } from './decimal';

describe('decimal utilities', () => {
  it('formats CNY without converting the amount to a native number', () => {
    expect(formatCny('9007199254740993.015')).toBe('¥9,007,199,254,740,993.02');
    expect(formatCny('0.1')).toBe('¥0.10');
  });

  it('converts only at the chart rendering boundary', () => {
    expect(decimalToChartNumber('12.34')).toBe(12.34);
  });
});
