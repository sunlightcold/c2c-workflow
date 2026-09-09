import { OperatorDto, PaginationDto } from '@/common/dto'
import { TutorialContent, TutorialLocale } from '@admin/database/system/tutorial.entity'
import { ApiProperty, PartialType } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator'

export class TutorialContentDto implements TutorialContent {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @ApiProperty({ description: '教程标题' })
  title: string

  @IsString()
  @MaxLength(300)
  @ApiProperty({ description: '教程摘要' })
  summary: string

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @ApiProperty({ description: '教程分区' })
  section: string

  @IsString()
  @ApiProperty({ description: 'Markdown 正文' })
  markdown: string

  @IsString()
  @MaxLength(160)
  @ApiProperty({ description: 'SEO 标题' })
  seoTitle: string

  @IsString()
  @MaxLength(320)
  @ApiProperty({ description: 'SEO 描述' })
  seoDescription: string

  @IsOptional()
  @IsUrl()
  @ApiProperty({ required: false, description: '封面地址' })
  coverUrl?: string
}

export class CreateTutorialDto extends OperatorDto {
  @IsEnum(TutorialLocale)
  @ApiProperty({ enum: TutorialLocale })
  locale: TutorialLocale

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @ApiProperty()
  slug: string

  @ApiProperty({ type: TutorialContentDto })
  @ValidateNested()
  @Type(() => TutorialContentDto)
  content: TutorialContentDto
}

export class UpdateTutorialDto extends PartialType(CreateTutorialDto) {}

export class TutorialFilterDto extends PaginationDto {
  @IsOptional()
  @IsEnum(TutorialLocale)
  locale?: TutorialLocale

  @IsOptional()
  @IsString()
  @MaxLength(160)
  keyword?: string
}

export class PublicTutorialQueryDto {
  @IsEnum(TutorialLocale)
  @ApiProperty({ enum: TutorialLocale, default: TutorialLocale.ZH })
  locale: TutorialLocale = TutorialLocale.ZH
}
