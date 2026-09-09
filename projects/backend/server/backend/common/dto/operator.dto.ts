import { ApiHideProperty, IntersectionType } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'

export class CreateOperatorDto {
  @ApiHideProperty()
  @Exclude()
  createBy?: number
}

export class UpdateOperatorDto {
  @ApiHideProperty()
  @Exclude()
  updateBy?: number
}

export class OperatorDto extends IntersectionType(CreateOperatorDto, UpdateOperatorDto) {}
