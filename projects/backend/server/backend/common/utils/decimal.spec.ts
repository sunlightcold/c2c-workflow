import {
  addDecimalStrings,
  formatDecimal,
  formatTrimmedDecimal,
  isPositiveDecimal,
  sumDecimalStrings,
} from './decimal'

describe('decimal utilities', () => {
  it('calculates decimal values without IEEE-754 precision loss', () => {
    expect(addDecimalStrings('0.1', '0.2')).toBe('0.3')
    expect(sumDecimalStrings(['9007199254740993.01', '0.02'], 2)).toBe('9007199254740993.03')
  })

  it('formats money and asset quantities without converting to Number', () => {
    expect(formatDecimal('9007199254740993.015', 2)).toBe('9007199254740993.02')
    expect(formatTrimmedDecimal('12.345678901234567890', 8)).toBe('12.3456789')
  })

  it('validates positive decimal strings exactly', () => {
    expect(isPositiveDecimal('0.01')).toBe(true)
    expect(isPositiveDecimal('0')).toBe(false)
  })
})
