import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsUUID } from 'class-validator'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export class DashboardOverviewQueryDto {
  @ApiPropertyOptional({ description: '平台人员当前经营的所属单位；代理商人员忽略此字段' })
  @IsOptional()
  @IsUUID()
  tenantId?: string

  @ApiPropertyOptional({ default: 14, enum: [7, 14, 30] })
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 14, 30])
  days = 14
}

export class DashboardRangeDto {
  @ApiProperty() days: number
  @ApiProperty() dateFrom: string
  @ApiProperty() dateTo: string
}

export class DashboardSummaryDto {
  @ApiProperty() activeBotCount: number
  @ApiProperty() activeGroupCount: number
  @ApiProperty() activeMerchantCount: number
  @ApiProperty() automatedMerchantCount: number
  @ApiProperty() batchCount: number
  @ApiProperty() batchExceptionCount: number
  @ApiProperty() batchProcessingCount: number
  @ApiProperty() batchSuccessCount: number
  @ApiProperty() merchantOrderAmount: string
  @ApiProperty() merchantOrderCount: number
  @ApiProperty() pendingPaymentCount: number
  @ApiProperty() pendingReleaseCount: number
  @ApiProperty() paymentAmount: string
  @ApiProperty() paymentCount: number
  @ApiProperty() paymentExceptionCount: number
  @ApiProperty() paymentProcessingCount: number
  @ApiProperty() paymentSuccessAmount: string
  @ApiProperty() paymentSuccessCount: number
  @ApiProperty() paymentSuccessRate: string
}

export class DashboardDailyTrendDto {
  @ApiProperty() date: string
  @ApiProperty() merchantOrderAmount: string
  @ApiProperty() merchantOrderCount: number
  @ApiProperty() paymentAmount: string
  @ApiProperty() paymentCount: number
  @ApiProperty() paymentSuccessAmount: string
  @ApiProperty() paymentSuccessCount: number
}

export class DashboardDistributionDto {
  @ApiProperty() amount: string
  @ApiProperty() count: number
  @ApiProperty() key: string
}

export class DashboardPlatformDto {
  @ApiProperty() amount: string
  @ApiProperty() merchantOrderCount: number
  @ApiProperty() paidCount: number
  @ApiProperty() pendingCount: number
  @ApiProperty() platform: string
}

export class DashboardMerchantRankingDto {
  @ApiProperty() merchantId: string
  @ApiProperty() merchantName: string
  @ApiProperty() paymentAmount: string
  @ApiProperty() paymentCount: number
  @ApiProperty() platform: string
  @ApiProperty() successAmount: string
  @ApiProperty() successCount: number
  @ApiProperty() successRate: string
}

export class DashboardOverviewDto {
  @ApiProperty({ type: [DashboardDailyTrendDto] }) dailyTrend: DashboardDailyTrendDto[]
  @ApiProperty({ format: 'date-time' }) generatedAt: string
  @ApiProperty({ type: [DashboardMerchantRankingDto] })
  merchantRanking: DashboardMerchantRankingDto[]
  @ApiProperty({ type: [DashboardDistributionDto] }) paymentSources: DashboardDistributionDto[]
  @ApiProperty({ type: [DashboardDistributionDto] }) paymentStatuses: DashboardDistributionDto[]
  @ApiProperty({ type: [DashboardPlatformDto] }) platforms: DashboardPlatformDto[]
  @ApiProperty({ type: DashboardRangeDto }) range: DashboardRangeDto
  @ApiProperty({ type: DashboardSummaryDto }) summary: DashboardSummaryDto
}
