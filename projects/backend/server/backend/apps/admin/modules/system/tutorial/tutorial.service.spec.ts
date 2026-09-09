import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TutorialEntity, TutorialLocale } from '@admin/database/system/tutorial.entity'
import { TutorialService } from './tutorial.service'

describe('TutorialService', () => {
  it('keeps drafts private and exposes only the published snapshot', async () => {
    const repository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({
        id: 'tutorial-1',
        locale: TutorialLocale.ZH,
        slug: 'getting-started',
        draft: {
          title: '草稿标题',
          summary: '草稿摘要',
          section: '入门',
          markdown: '# 草稿',
          seoTitle: '草稿 SEO',
          seoDescription: '草稿描述',
        },
        published: null,
        publishedAt: null,
      }),
    }

    const moduleRef = await Test.createTestingModule({
      providers: [
        TutorialService,
        { provide: getRepositoryToken(TutorialEntity), useValue: repository },
      ],
    }).compile()

    const service = moduleRef.get(TutorialService)

    await expect(
      service.getPublishedBySlug('getting-started', TutorialLocale.ZH),
    ).resolves.toBeNull()
    expect(repository.findOne).toHaveBeenCalledWith({
      where: {
        slug: 'getting-started',
        locale: TutorialLocale.ZH,
      },
    })
  })
})
