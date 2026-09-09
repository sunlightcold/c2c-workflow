import { ApiProperty } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Min } from 'class-validator'
import { IPaginationOptions } from 'nestjs-typeorm-paginate'

export class PaginationDto {
  @Min(1)
  @IsInt()
  @Type(() => Number)
  @ApiProperty({ type: Number, description: '分页索引', required: true })
  pageIndex: number

  @Min(1)
  @IsInt()
  @Type(() => Number)
  @ApiProperty({ type: Number, description: '分页数', required: true })
  pageSize: number
}

export function toPaginationParams<D extends { pageSize: number; pageIndex: number }>(data: D) {
  const { pageIndex, pageSize, ...params } = data
  const paginateOptions: IPaginationOptions = { page: pageIndex, limit: pageSize }
  return { paginateOptions, params }
}
