import type { TransformFnParams } from 'class-transformer'
import { Transform } from 'class-transformer'
import { isEmpty } from 'class-validator'

export function trimStringToNull(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value !== 'string') {
    return value
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export class TransformUtil {
  static toArray() {
    return Transform(({ value }: TransformFnParams) =>
      value === undefined || Array.isArray(value) ? value : [value],
    )
  }

  static toNumber() {
    return Transform(({ value }) => (value ? Number(value) : value))
  }

  static toString(trim = false) {
    return Transform(({ value }) =>
      isEmpty(value) ? value : trim ? String(value).trim() : String(value),
    )
  }

  /**
   * 注意使用toOr必须在DTO中配置$or字段
   * @Expose()
   * @IsOptional()
   * @TransformUtil.toOr('orderNo', ['sysOrderNo', 'mchOrderNo', 'outOrderNo'])
   * $or?: Array<object>
   *
   * @Exclude()
   * @IsOptional()
   * @IsString({ message: '系统订单号/商户订单号/上游订单号' })
   * @ApiProperty({ type: String, description: '系统订单号/商户订单号/上游订单号' })
   * orderNo?: string
   */
  static toOr(valueField: string, fields: string[]) {
    return Transform((params: TransformFnParams) => {
      const { obj } = params
      const value = obj[valueField]
      if (isEmpty(value) || !fields.length) return undefined
      const $or: Array<Record<string, unknown>> = Reflect.has(obj, '$or')
        ? (obj.$or as Array<Record<string, unknown>>)
        : []
      for (const field of fields) {
        $or.push({ [field]: value })
      }
      return $or
    })
  }
}
