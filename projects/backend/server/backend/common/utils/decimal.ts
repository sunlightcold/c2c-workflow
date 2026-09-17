import Big from 'big.js'

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/

export function decimal(value: unknown): Big {
  const text = String(value ?? '').trim()
  if (!DECIMAL_PATTERN.test(text)) throw new Error('无效的十进制数值')
  return new Big(text)
}

export function formatDecimal(value: unknown, decimalPlaces: number): string {
  try {
    return decimal(value).toFixed(decimalPlaces)
  } catch {
    return new Big(0).toFixed(decimalPlaces)
  }
}

export function formatTrimmedDecimal(value: unknown, maximumDecimalPlaces: number): string {
  try {
    return decimal(value)
      .round(maximumDecimalPlaces, Big.roundHalfUp)
      .toFixed(maximumDecimalPlaces)
      .replace(/\.0+$/, '')
      .replace(/(\.\d*?)0+$/, '$1')
  } catch {
    return '0'
  }
}

export function addDecimalStrings(left: string, right: string): string {
  return decimal(left).plus(decimal(right)).toFixed()
}

export function sumDecimalStrings(values: string[], decimalPlaces?: number): string {
  const total = values.reduce((sum, value) => sum.plus(decimal(value)), new Big(0))
  return decimalPlaces === undefined ? total.toFixed() : total.toFixed(decimalPlaces)
}

export function isPositiveDecimal(value: string): boolean {
  try {
    return decimal(value).gt(0)
  } catch {
    return false
  }
}
