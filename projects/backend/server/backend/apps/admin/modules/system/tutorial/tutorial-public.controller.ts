import { Public } from '@/common/decorators'
import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublicTutorialQueryDto } from './tutorial.dto'
import { TutorialService } from './tutorial.service'

@ApiTags('公开教程')
@Controller('tutorials')
export class TutorialPublicController {
  constructor(private readonly tutorialService: TutorialService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: '查询已发布教程' })
  list(@Query() query: PublicTutorialQueryDto) {
    return this.tutorialService.listPublished(query.locale)
  }

  @Get(':slug')
  @Public()
  async get(@Param('slug') slug: string, @Query() query: PublicTutorialQueryDto) {
    const tutorial = await this.tutorialService.getPublishedBySlug(slug, query.locale)
    if (!tutorial) throw new NotFoundException('教程不存在')
    return tutorial
  }
}
