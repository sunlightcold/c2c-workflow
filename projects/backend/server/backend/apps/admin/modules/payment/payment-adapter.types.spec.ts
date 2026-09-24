import { sameCnyAmount } from './payment-adapter.types'

describe('payment amount helpers', () => {
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
