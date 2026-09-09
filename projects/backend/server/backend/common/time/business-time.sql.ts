import { resolveBusinessTimeConfig } from './business-time.config'
import {
  BUSINESS_DATE_FORMAT,
  type BusinessTimeConfig,
  type BusinessTimeRange,
} from './business-time.types'

export interface BusinessTimeSqlCondition {
  expression: string
  parameters: Record<string, Date>
}

export function createBusinessTimeRangeCondition(
  columnExpression: string,
  range: BusinessTimeRange,
  parameterPrefix = '',
): BusinessTimeSqlCondition {
  const names = createRangeParameterNames(parameterPrefix)
  const expressionParts: string[] = []
  const parameters: Record<string, Date> = {}

  if (range.start) {
    expressionParts.push(`${columnExpression} >= :${names.start}`)
    parameters[names.start] = range.start
  }

  if (range.endExclusive) {
    expressionParts.push(`${columnExpression} < :${names.end}`)
    parameters[names.end] = range.endExclusive
  }

  if (expressionParts.length === 0) {
    throw new Error('Business time range must contain start or endExclusive')
  }

  return {
    expression: expressionParts.join(' AND '),
    parameters,
  }
}

export function toBusinessLocalTimestampSql(
  columnExpression: string,
  options: Partial<BusinessTimeConfig> = {},
) {
  const config = resolveBusinessTimeConfig(options)
  return `(${columnExpression} AT TIME ZONE ${sqlString(config.timeZone)})`
}

export function toBusinessDateSql(
  columnExpression: string,
  options: Partial<BusinessTimeConfig> = {},
) {
  return `TO_CHAR(${toBusinessLocalTimestampSql(columnExpression, options)}, '${BUSINESS_DATE_FORMAT}')`
}

function createRangeParameterNames(parameterPrefix: string) {
  if (!parameterPrefix) {
    return {
      end: 'end',
      start: 'start',
    }
  }

  return {
    end: `${parameterPrefix}End`,
    start: `${parameterPrefix}Start`,
  }
}

function sqlString(value: string) {
  return `'${value.replace(/'/g, "''")}'`
}
