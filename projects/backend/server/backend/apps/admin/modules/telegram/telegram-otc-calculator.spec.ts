import {
  calculateTelegramOtcExpression,
  TelegramOtcCalculatorError,
} from './telegram-otc-calculator'

describe('calculateTelegramOtcExpression', () => {
  it.each([
    ['4*7', '28'],
    ['100/2-30+1', '21'],
    ['(2+3)*4', '20'],
    ['-.5+1.25', '0.75'],
    ['2/3', '0.6666666666666666'],
  ])('calculates %s without native floating point', (expression, expected) => {
    expect(calculateTelegramOtcExpression(expression)).toBe(expected)
  })

  it.each(['1/0', '1+a', '(1+2'])('rejects invalid expression %s', (expression) => {
    expect(() => calculateTelegramOtcExpression(expression)).toThrow(TelegramOtcCalculatorError)
  })
})
