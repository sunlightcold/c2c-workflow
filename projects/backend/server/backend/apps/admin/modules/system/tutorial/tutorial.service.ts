import {
  TutorialContent,
  TutorialEntity,
  TutorialLocale,
} from '@admin/database/system/tutorial.entity'
import { toPaginationParams } from '@/common/dto'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { paginate } from 'nestjs-typeorm-paginate'
import { Repository } from 'typeorm'
import { CreateTutorialDto, TutorialFilterDto, UpdateTutorialDto } from './tutorial.dto'

export interface PublishedTutorialSummary {
  slug: string
  locale: TutorialLocale
  content: Omit<TutorialContent, 'markdown'>
  publishedAt: Date
}

@Injectable()
export class TutorialService {
  constructor(
    @InjectRepository(TutorialEntity)
    private readonly repository: Repository<TutorialEntity>,
  ) {}

  filter(dto: TutorialFilterDto) {
    const { paginateOptions } = toPaginationParams(dto)
    const query = this.repository.createQueryBuilder('tutorial')
    if (dto.locale) query.andWhere('tutorial.locale = :locale', { locale: dto.locale })
    if (dto.keyword) {
      query.andWhere("(tutorial.draft->>'title' ILIKE :keyword OR tutorial.slug ILIKE :keyword)", {
        keyword: `%${dto.keyword}%`,
      })
    }
    query.orderBy('tutorial.updatedAt', 'DESC')
    return paginate(query, paginateOptions)
  }

  async create(dto: CreateTutorialDto): Promise<TutorialEntity> {
    return this.repository.save({
      locale: dto.locale,
      slug: dto.slug,
      draft: dto.content,
      published: null,
      publishedAt: null,
      createBy: dto.createBy,
      updateBy: dto.updateBy,
    })
  }

  async getById(id: string): Promise<TutorialEntity> {
    const tutorial = await this.repository.findOne({ where: { id } })
    if (!tutorial) throw new NotFoundException('教程不存在')
    return tutorial
  }

  async update(id: string, dto: UpdateTutorialDto): Promise<TutorialEntity> {
    const tutorial = await this.getById(id)
    return this.repository.save(
      this.repository.merge(tutorial, {
        ...(dto.locale ? { locale: dto.locale } : {}),
        ...(dto.slug ? { slug: dto.slug } : {}),
        ...(dto.content ? { draft: dto.content } : {}),
        ...(dto.updateBy ? { updateBy: dto.updateBy } : {}),
      }),
    )
  }

  async remove(id: string): Promise<void> {
    const result = await this.repository.delete(id)
    if (!result.affected) throw new NotFoundException('教程不存在')
  }

  async publish(id: string, updateBy: number): Promise<TutorialEntity> {
    const tutorial = await this.getById(id)
    return this.repository.save(
      this.repository.merge(tutorial, {
        published: tutorial.draft,
        publishedAt: new Date(),
        updateBy,
      }),
    )
  }

  async unpublish(id: string, updateBy: number): Promise<TutorialEntity> {
    const tutorial = await this.getById(id)
    return this.repository.save(
      this.repository.merge(tutorial, { published: null, publishedAt: null, updateBy }),
    )
  }

  async getPublishedBySlug(
    slug: string,
    locale: TutorialLocale,
  ): Promise<{
    slug: string
    locale: TutorialLocale
    content: TutorialContent
    publishedAt: Date
  } | null> {
    const tutorial = await this.repository.findOne({ where: { slug, locale } })
    if (!tutorial?.published || !tutorial.publishedAt) return null
    return {
      slug: tutorial.slug,
      locale: tutorial.locale,
      content: tutorial.published,
      publishedAt: tutorial.publishedAt,
    }
  }

  listPublished(locale: TutorialLocale): Promise<PublishedTutorialSummary[]> {
    return this.repository
      .createQueryBuilder('tutorial')
      .select('tutorial.slug', 'slug')
      .addSelect('tutorial.locale', 'locale')
      .addSelect("tutorial.published - 'markdown'", 'content')
      .addSelect('tutorial.publishedAt', 'publishedAt')
      .where('tutorial.locale = :locale', { locale })
      .andWhere('tutorial.published IS NOT NULL')
      .andWhere('tutorial.publishedAt IS NOT NULL')
      .orderBy("tutorial.published->>'section'", 'ASC')
      .addOrderBy("tutorial.published->>'title'", 'ASC')
      .getRawMany<PublishedTutorialSummary>()
  }
}
