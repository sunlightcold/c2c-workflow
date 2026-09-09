import { INestApplication, Module, ModuleMetadata } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { RouterModule } from '@nestjs/core'
import { configureAdminHttpApp } from '@/apps/admin/configure-app'

export async function createAdminContractTestApp(
  options: Pick<ModuleMetadata, 'controllers' | 'providers'> & { path?: string },
): Promise<INestApplication> {
  @Module({
    controllers: options.controllers,
    providers: options.providers,
  })
  class ContractFeatureModule {}

  @Module({
    imports: [
      ContractFeatureModule,
      RouterModule.register([{ path: options.path ?? 'app', module: ContractFeatureModule }]),
    ],
  })
  class ContractRootModule {}

  const moduleRef = await Test.createTestingModule({
    imports: [ContractRootModule],
  }).compile()

  const app = moduleRef.createNestApplication()
  configureAdminHttpApp(app)
  await app.init()
  return app
}

export function expectWrappedSuccess(body: unknown) {
  expect(body).toEqual(
    expect.objectContaining({
      code: 200,
      msg: 'success',
      timestamp: expect.any(String),
      data: expect.anything(),
    }),
  )
}

export function expectWrappedError(body: unknown, status: number) {
  expect(body).toEqual(
    expect.objectContaining({
      code: status,
      msg: expect.any(String),
      timestamp: expect.any(String),
      path: expect.any(String),
    }),
  )
}
