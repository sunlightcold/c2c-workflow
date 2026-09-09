import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsDateString, IsOptional, Matches, Validate, ValidatorConstraint } from 'class-validator'
import type { ValidationArguments, ValidatorConstraintInterface } from 'class-validator'

const BUSINESS_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

@ValidatorConstraint({ name: 'businessDateRangeOrder', async: false })
class BusinessDateRangeOrderConstraint implements ValidatorConstraintInterface {
  validate(dateTo: string | undefined, args: ValidationArguments) {
    const dateFrom = (args.object as BusinessDateRangeDto).dateFrom
    return !dateFrom || !dateTo || dateFrom <= dateTo
  }

  defaultMessage() {
    return '结束日期不能早于开始日期'
  }
}

export class BusinessDateRangeDto {
  @ApiPropertyOptional({ description: '开始日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(BUSINESS_DATE_PATTERN)
  dateFrom?: string

  @ApiPropertyOptional({ description: '结束日期，格式 YYYY-MM-DD' })
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(BUSINESS_DATE_PATTERN)
  @Validate(BusinessDateRangeOrderConstraint)
  dateTo?: string
}
