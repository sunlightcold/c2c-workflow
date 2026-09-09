import { PaginationDto } from '@/common/dto'
import { ExecuteEnum } from '@/common/interfaces'
import { SysTaskSource } from '@/apps/admin/database'
import { ApiProperty, IntersectionType, PartialType, PickType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDate, IsEnum, IsInt, IsOptional, IsString } from 'class-validator'

export class TaskLogCreateDto {
  @IsEnum(ExecuteEnum)
  @Type(() => Number)
  @ApiProperty({ enum: ExecuteEnum, description: '任务状态' })
  status: ExecuteEnum

  @IsOptional()
  @IsString()
  @ApiProperty({ description: '任务日志信息', required: false })
  detail?: string

  @IsInt()
  @ApiProperty({ description: '任务耗时' })
  consumeTime: number

  @IsDate()
  @ApiProperty({ description: '任务开始时间' })
  startedAt: Date

  @IsDate()
  @ApiProperty({ description: '任务结束时间' })
  endedAt: Date

  @IsString()
  @ApiProperty({ description: '任务ID' })
  taskId: string

  @IsString()
  @ApiProperty({ description: '任务名称' })
  taskName: string

  @IsOptional()
  @IsEnum(SysTaskSource)
  @ApiProperty({ enum: SysTaskSource, required: false, description: '任务来源' })
  taskSource?: SysTaskSource
}

export class TaskLogFilterDto extends IntersectionType(
  PaginationDto,
  PartialType(PickType(TaskLogCreateDto, ['status', 'taskName', 'taskSource'])),
) {}
