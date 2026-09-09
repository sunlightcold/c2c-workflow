import { INestApplication, Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import request from 'supertest'

jest.mock('@/common/decorators', () => {
  const { createParamDecorator, SetMetadata } = jest.requireActual('@nestjs/common')
  return {
    Public: () => SetMetadata('contract:public', true),
    Permission: (permission: string) => SetMetadata('contract:permission', permission),
    User: createParamDecorator(() => ({ uid: 1 })),
    definePermission: (prefix: string, actions: readonly string[]) =>
      Object.fromEntries(actions.map((action) => [action.toUpperCase(), `${prefix}:${action}`])),
  }
})

jest.mock('@/common/pipes', () => ({
  CreatorPipe: class CreatorPipe {},
  UpdaterPipe: class UpdaterPipe {},
  ValidateFilePipe: class ValidateFilePipe {},
}))

jest.mock('@/common/utils', () => ({
  getConfig: () => ({ maxFileSize: 10 * 1024 * 1024 }),
  ValidationMatch: { image: { regExp: /image\/.+/ } },
}))

jest.mock('@/apps/admin/modules/system/storage/storage.service', () => ({
  StorageService: class StorageService {},
}))

import { configureAdminHttpApp } from '@/apps/admin/configure-app'
import { TutorialLocale } from '@/apps/admin/database/system/tutorial.entity'
import { StorageService } from '@/apps/admin/modules/system/storage/storage.service'
import { SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE } from '@/apps/admin/modules/system/storage/storage-purpose.registry'
import { TutorialAdminController } from '@/apps/admin/modules/system/tutorial/tutorial-admin.controller'
import { TutorialPublicController } from '@/apps/admin/modules/system/tutorial/tutorial-public.controller'
import { TutorialService } from '@/apps/admin/modules/system/tutorial/tutorial.service'

describe('Tutorial center routes (e2e)', () => {
  let app: INestApplication

  const tutorialService = {
    filter: jest.fn(),
    listPublished: jest.fn(),
  }
  const storageService = {
    put: jest.fn(),
  }

  beforeAll(async () => {
    @Module({
      controllers: [TutorialAdminController],
      providers: [
        { provide: TutorialService, useValue: tutorialService },
        { provide: StorageService, useValue: storageService },
      ],
    })
    class TutorialAdminContractModule {}

    @Module({
      controllers: [TutorialPublicController],
      providers: [{ provide: TutorialService, useValue: tutorialService }],
    })
    class TutorialPublicContractModule {}

    @Module({
      imports: [
        TutorialAdminContractModule,
        TutorialPublicContractModule,
        RouterModule.register([
          { path: 'sys', module: TutorialAdminContractModule },
          { path: '', module: TutorialPublicContractModule },
        ]),
      ],
    })
    class TutorialContractModule {}

    const moduleRef = await Test.createTestingModule({
      imports: [TutorialContractModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureAdminHttpApp(app)
    await app.init()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    tutorialService.filter.mockResolvedValue({ items: [], meta: {} })
    tutorialService.listPublished.mockResolvedValue([])
    storageService.put.mockResolvedValue({
      channelId: '00000000-0000-4000-8000-000000000001',
      fileUrl: 'https://cdn.example.com/tutorials/content/install-desktop.webp',
      objectKey: 'tutorials/content/install-desktop.webp',
    })
  })

  afterAll(async () => {
    await app.close()
  })

  it('exposes administration at the system route and public tutorials at the root route', async () => {
    const [adminResponse, publicResponse] = await Promise.all([
      request(app.getHttpServer()).get('/v1/sys/tutorials').query({ pageIndex: 1, pageSize: 100 }),
      request(app.getHttpServer()).get('/v1/tutorials').query({ locale: TutorialLocale.ZH }),
    ])

    expect(adminResponse.status).toBe(200)
    expect(adminResponse.body.data).toEqual({ items: [], meta: {} })
    expect(publicResponse.status).toBe(200)
    expect(publicResponse.body.data).toEqual([])
    expect(tutorialService.filter).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 1, pageSize: 100 }),
    )
    expect(tutorialService.listPublished).toHaveBeenCalledWith(TutorialLocale.ZH)
  })

  it('rejects unsupported public tutorial locales', async () => {
    const response = await request(app.getHttpServer()).get('/v1/tutorials').query({ locale: 'fr' })

    expect(response.status).toBe(400)
    expect(tutorialService.listPublished).not.toHaveBeenCalled()
  })

  it('stores tutorial images through the dedicated public storage purpose', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/sys/tutorials/images')
      .attach('file', Buffer.from('tutorial-image'), {
        contentType: 'image/webp',
        filename: 'install-desktop.webp',
      })

    expect(response.status).toBe(201)
    expect(response.body.data).toEqual({
      url: 'https://cdn.example.com/tutorials/content/install-desktop.webp',
    })
    expect(storageService.put).toHaveBeenCalledWith(
      SYSTEM_TUTORIAL_CONTENT_STORAGE_PURPOSE,
      expect.objectContaining({
        body: Buffer.from('tutorial-image'),
        contentType: 'image/webp',
        objectKey: expect.any(String),
      }),
    )
  })
})
