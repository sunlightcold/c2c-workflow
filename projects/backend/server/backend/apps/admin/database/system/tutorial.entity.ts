import { TraceableUuidEntity } from '@/common/entities'
import { Column, Entity, Index } from 'typeorm'

export const TutorialTableName = 'sys_tutorial'

export enum TutorialLocale {
  ZH = 'zh',
  EN = 'en',
  JA = 'ja',
  ZH_HANT = 'zh-Hant',
}

export interface TutorialContent {
  title: string
  summary: string
  section: string
  markdown: string
  seoTitle: string
  seoDescription: string
  coverUrl?: string
}

@Entity(TutorialTableName)
@Index(['locale', 'slug'], { unique: true })
export class TutorialEntity extends TraceableUuidEntity {
  @Column({ type: 'enum', enum: TutorialLocale })
  locale: TutorialLocale

  @Column({ type: 'varchar', length: 160 })
  slug: string

  @Column({ type: 'jsonb' })
  draft: TutorialContent

  @Column({ type: 'jsonb', nullable: true })
  published: TutorialContent | null

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null
}
