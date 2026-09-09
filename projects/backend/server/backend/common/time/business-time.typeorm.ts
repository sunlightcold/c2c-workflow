import type { FindOperator } from 'typeorm'
import { Raw } from 'typeorm'
import { createBusinessTimeRangeCondition } from './business-time.sql'
import type { BusinessTimeRange } from './business-time.types'

export function createBusinessTimeRangeOperator(
  range: BusinessTimeRange,
  parameterPrefix = '',
): FindOperator<Date> {
  const parameters = createBusinessTimeRangeCondition('value', range, parameterPrefix).parameters
  return Raw(
    (alias) => createBusinessTimeRangeCondition(alias, range, parameterPrefix).expression,
    parameters,
  )
}
