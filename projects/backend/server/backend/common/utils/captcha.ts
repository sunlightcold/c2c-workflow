import svgCaptcha, { type ConfigObject } from 'svg-captcha'

/**
 * 生成文本图形验证码
 */
export function generateSvgTextCaptcha(options: ConfigObject = {}) {
  const { data, text } = svgCaptcha.create({
    size: 4, // 验证码长度
    noise: 2, // 干扰线条数
    color: true, // 是否使用颜色
    background: '#ccf2ff', // 背景颜色
    width: 100,
    height: 40,
    ...options,
  })

  return {
    data: Buffer.from(data).toString('base64'), // SVG 图形验证码 base64
    text, // 验证码
  }
}

/**
 * 生成数学表达式图形验证码
 */
export function generateSvgMatchCaptcha(options: ConfigObject = {}) {
  const { data, text } = svgCaptcha.createMathExpr({
    noise: 2, // 干扰线条数
    color: true, // 是否使用颜色
    background: '#ccf2ff', // 背景颜色
    mathMin: 0,
    mathMax: 100,
    mathOperator: '+/-',
    width: 100,
    height: 40,
    ...options,
  })

  return {
    data: Buffer.from(data).toString('base64'), // SVG 图形验证码 base64
    text, // 验证码
  }
}
