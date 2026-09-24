import { normalizeCnyAmount, sameCnyAmount } from './payment-adapter.types'

describe('payment amount helpers', () => {
  it.each([
    ['100.10000', '100.10'],
    ['100.1', '100.10'],
    ['100.00000000', '100.00'],
  ])('accepts trailing zero formats for CNY input: %s -> %s', (value, expected) => {
    expect(normalizeCnyAmount(value)).toBe(expected)
  })

  it('never rounds a meaningful third decimal place into a payable amount', () => {
    expect(() => normalizeCnyAmount('100.10500')).toThrow()
  })

  it('rejects meaningful precision beyond two decimal places instead of rounding', () => {
    expect(() => normalizeCnyAmount('100.10100')).toThrow('金额必须是非负数字，最多两位有效小数')
  })

  it.each([
    ['100', '100.00'],
    ['100.00000000', '100.00'],
    ['0.10', '0.100000'],
  ])('treats equivalent decimal formats as the same CNY amount: %s and %s', (left, right) => {
    expect(sameCnyAmount(left, right)).toBe(true)
  })

  it.each([
    ['100.01', '100.00'],
    ['100.001', '100.00'],
  ])('does not hide a real CNY amount difference: %s and %s', (left, right) => {
    expect(sameCnyAmount(left, right)).toBe(false)
  })

  it('returns false for malformed amounts instead of making an unsafe match', () => {
    expect(sameCnyAmount('100.00000000x', '100.00')).toBe(false)
  })
})
