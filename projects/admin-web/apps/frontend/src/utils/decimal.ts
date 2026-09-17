import Big from 'big.js';

export function formatCny(value: null | string | undefined): string {
  let fixed: string;
  try {
    fixed = new Big(value?.trim() || '0').toFixed(2);
  } catch {
    fixed = '0.00';
  }
  const negative = fixed.startsWith('-');
  const [whole = '0', fraction = '00'] = (
    negative ? fixed.slice(1) : fixed
  ).split('.');
  const grouped = whole.replaceAll(/\B(?=(?:\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}¥${grouped}.${fraction}`;
}

export function decimalToChartNumber(value: string): number {
  return new Big(value).toNumber();
}
