import { SysTaskSource, SysTaskStatus, SysTaskTypeEnum } from '@/apps/admin/database'
import { OperatorDto, PaginationDto } from '@/common/dto'
import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDate, IsEnum, IsInt, IsOptional, IsString, MaxLength } from 'class-validator'

export class TaskCreateDto extends OperatorDto {
  @MaxLength(20)
  @IsString()
  @ApiProperty({ description: '任务名称', maxLength: 20, required: true })
  name: string

  @MaxLength(200)
  @IsString()
  @ApiProperty({ description: '任务标识', maxLength: 200, required: true })
  service: string

  @IsEnum(SysTaskTypeEnum)
  @ApiProperty({ enum: SysTaskTypeEnum, description: '任务类型' })
  type: SysTaskTypeEnum

  @IsEnum(SysTaskStatus)
  @Type(() => Number)
  @ApiProperty({ enum: SysTaskStatus, description: '任务状态', maxLength: 100 })
  status: SysTaskStatus

  @IsOptional()
  @IsDate()
  @ApiProperty({ description: '开始时间', required: false })
  startedAt?: Date

  @IsOptional()
  @IsDate()
  @ApiProperty({ description: '结束时间', required: false })
  endedAt?: Date

  @IsOptional()
  @IsInt()
  @ApiProperty({ description: '执行间隔', required: false })
  limit?: number

  @IsOptional()
  @ApiProperty({ description: 'corn表达式', required: false })
  cron?: string

  @IsOptional()
  @IsInt()
  @ApiProperty({ description: '执行次数', required: false })
  every?: number

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '任务参数', required: false })
  data?: string

  @IsOptional()
  @MaxLength(200)
  @IsString()
  @ApiProperty({ description: '任务描述', required: false, maxLength: 200 })
  description?: string
}

export class TaskUpdateDto extends PartialType(TaskCreateDto) {}

export class TaskFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(PickType(TaskCreateDto, ['name', 'status', 'type', 'description'])),
) {
  @IsOptional()
  @IsEnum(SysTaskSource)
  @ApiProperty({ enum: SysTaskSource, required: false, description: '任务来源' })
  source?: SysTaskSource
}
