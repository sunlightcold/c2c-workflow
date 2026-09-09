/// <reference types="jest" />

import developmentConfig from '@/config/development'
import { migrateTutorialCenter } from '@/apps/admin/database/migrations/tutorial-center.migration'
import {
  TutorialEntity,
  TutorialLocale,
  type TutorialContent,
} from '@/apps/admin/database/system/tutorial.entity'
import { TutorialService } from '@/apps/admin/modules/system/tutorial/tutorial.service'
import { DataSource, type QueryRunner } from 'typeorm'

describe('tutorial center migration database integration', () => {
  const { postgres } = developmentConfig.admin
  const schema = `tutorial_center_test_${process.pid}_${Date.now()}`

  let adminDataSource: DataSource
  let dataSource: DataSource
  let queryRunner: QueryRunner

  beforeAll(async () => {
    adminDataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      synchronize: false,
      logging: false,
    })
    await adminDataSource.initialize()
    await adminDataSource.query(`CREATE SCHEMA "${schema}"`)

    dataSource = new DataSource({
      type: 'postgres',
      host: postgres.host,
      port: postgres.port,
      username: postgres.username,
      password: postgres.password,
      database: postgres.database,
      schema,
      entities: [TutorialEntity],
      synchronize: false,
      logging: false,
    })
    await dataSource.initialize()
    queryRunner = dataSource.createQueryRunner()
    await queryRunner.connect()
    await queryRunner.startTransaction()
    await queryRunner.query(`SET LOCAL search_path TO "${schema}", public`)
  })

  afterAll(async () => {
    if (queryRunner?.isTransactionActive) await queryRunner.rollbackTransaction()
    if (queryRunner && !queryRunner.isReleased) await queryRunner.release()
    if (dataSource?.isInitialized) await dataSource.destroy()
    if (adminDataSource?.isInitialized) {
      await adminDataSource.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await adminDataSource.destroy()
    }
  })

  it('creates the tutorial table and unique locale slug index idempotently', async () => {
    await migrateTutorialCenter(queryRunner.manager)
    await migrateTutorialCenter(queryRunner.manager)

    const columns = (await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'sys_tutorial'`,
    )) as Array<{ column_name: string }>
    expect(columns.map(({ column_name }) => column_name)).toEqual(
      expect.arrayContaining(['draft', 'locale', 'published', 'publishedAt', 'slug']),
    )

    const indexes = (await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = 'sys_tutorial'`,
    )) as Array<{ indexname: string }>
    expect(indexes.map(({ indexname }) => indexname)).toContain('uq_sys_tutorial_locale_slug')
  })

  it('keeps draft changes private until each explicit publication', async () => {
    await migrateTutorialCenter(queryRunner.manager)
    const service = new TutorialService(queryRunner.manager.getRepository(TutorialEntity))
    const firstDraft: TutorialContent = {
      title: '快速开始',
      summary: '创建第一个项目',
      section: '入门',
      markdown: '# 第一版',
      seoTitle: '快速开始',
      seoDescription: 'MagicPerler 快速开始',
    }
    const secondDraft = { ...firstDraft, markdown: '# 第二版' }

    const tutorial = await service.create({
      locale: TutorialLocale.ZH,
      slug: 'getting-started',
      content: firstDraft,
      createBy: 1,
      updateBy: 1,
    })
    await expect(service.getPublishedBySlug(tutorial.slug, tutorial.locale)).resolves.toBeNull()

    await service.publish(tutorial.id, 1)
    await expect(service.getPublishedBySlug(tutorial.slug, tutorial.locale)).resolves.toMatchObject(
      { content: firstDraft },
    )

    await service.update(tutorial.id, { content: secondDraft, updateBy: 2 })
    await expect(service.getPublishedBySlug(tutorial.slug, tutorial.locale)).resolves.toMatchObject(
      { content: firstDraft },
    )

    await service.publish(tutorial.id, 2)
    await expect(service.getPublishedBySlug(tutorial.slug, tutorial.locale)).resolves.toMatchObject(
      { content: secondDraft },
    )
    await expect(service.listPublished(tutorial.locale)).resolves.toEqual([
      {
        slug: tutorial.slug,
        locale: tutorial.locale,
        content: {
          title: secondDraft.title,
          summary: secondDraft.summary,
          section: secondDraft.section,
          seoTitle: secondDraft.seoTitle,
          seoDescription: secondDraft.seoDescription,
        },
        publishedAt: expect.any(Date),
      },
    ])

    await service.unpublish(tutorial.id, 2)
    await expect(service.getPublishedBySlug(tutorial.slug, tutorial.locale)).resolves.toBeNull()

    await service.remove(tutorial.id)
    await expect(service.getById(tutorial.id)).rejects.toMatchObject({ status: 404 })
  })
})
