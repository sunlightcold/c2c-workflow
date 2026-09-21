import Big from 'big.js'

export class TelegramOtcCalculatorError extends Error {}

const CalculatorBig = Big()
CalculatorBig.DP = 100
CalculatorBig.RM = CalculatorBig.roundDown

interface Token {
  type: 'left' | 'number' | 'operator' | 'right'
  value: string
}

function tokenize(expression: string): Token[] {
  if (!expression.trim() || expression.length > 200)
    throw new TelegramOtcCalculatorError('表达式为空或过长')
  const tokens: Token[] = []
  let index = 0
  while (index < expression.length) {
    const char = expression[index]
    if (/\s/.test(char)) {
      index += 1
      continue
    }
    if (/[0-9.]/.test(char)) {
      const match = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)/)
      if (!match || !/\d/.test(match[0])) throw new TelegramOtcCalculatorError('数字格式错误')
      tokens.push({ type: 'number', value: match[0] })
      index += match[0].length
      continue
    }
    if ('+-*/'.includes(char)) tokens.push({ type: 'operator', value: char })
    else if (char === '(') tokens.push({ type: 'left', value: char })
    else if (char === ')') tokens.push({ type: 'right', value: char })
    else throw new TelegramOtcCalculatorError('表达式包含不支持的字符')
    index += 1
  }
  return tokens
}

export function calculateTelegramOtcExpression(expression: string): string {
  const tokens = tokenize(expression)
  let cursor = 0

  const parsePrimary = (): Big => {
    const token = tokens[cursor]
    if (!token) throw new TelegramOtcCalculatorError('表达式不完整')
    if (token.type === 'operator' && (token.value === '+' || token.value === '-')) {
      cursor += 1
      const value = parsePrimary()
      return token.value === '-' ? value.times(-1) : value
    }
    if (token.type === 'number') {
      cursor += 1
      return new CalculatorBig(token.value)
    }
    if (token.type === 'left') {
      cursor += 1
      const value = parseAdditive()
      if (tokens[cursor]?.type !== 'right') throw new TelegramOtcCalculatorError('括号不匹配')
      cursor += 1
      return value
    }
    throw new TelegramOtcCalculatorError('表达式格式错误')
  }

  const parseMultiplicative = (): Big => {
    let value = parsePrimary()
    while (tokens[cursor]?.type === 'operator' && '*/'.includes(tokens[cursor].value)) {
      const operator = tokens[cursor++].value
      const right = parsePrimary()
      if (operator === '/' && right.eq(0)) throw new TelegramOtcCalculatorError('除数不能为 0')
      value = operator === '*' ? value.times(right) : value.div(right)
    }
    return value
  }

  const parseAdditive = (): Big => {
    let value = parseMultiplicative()
    while (tokens[cursor]?.type === 'operator' && '+-'.includes(tokens[cursor].value)) {
      const operator = tokens[cursor++].value
      const right = parseMultiplicative()
      value = operator === '+' ? value.plus(right) : value.minus(right)
    }
    return value
  }

  const result = parseAdditive()
  if (cursor !== tokens.length) throw new TelegramOtcCalculatorError('表达式格式错误')
  const text = result.toFixed(16, CalculatorBig.roundDown).replace(/\.?0+$/, '')
  if (text.replace(/[.-]/g, '').length > 80) throw new TelegramOtcCalculatorError('计算结果过大')
  return text === '-0' ? '0' : text
}
