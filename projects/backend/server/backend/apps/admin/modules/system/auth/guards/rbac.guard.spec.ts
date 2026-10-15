import type { ExecutionContext } from '@nestjs/common'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Permission, type PermissionRequirement } from '@/common/decorators'
import { RbacAuthGuard } from './rbac.guard'

jest.mock('@/common/utils', () => ({
  isSuperAdmin: () => false,
  isPlainObject: (value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value),
}))
jest.mock('../auth.service', () => ({ AuthService: class AuthService {} }))
jest.mock('@admin/modules/cache', () => ({ CacheService: class CacheService {} }))

describe('RbacAuthGuard permission requirements', () => {
  const optionsPermissions = [
    'merchant:ad:read',
    'merchant:ad:sync',
    'merchant:ad:rule',
    'merchant:adRun:read',
  ]
  const cacheService = { getPermissions: jest.fn() }
  let guard: RbacAuthGuard

  function context(requirement: PermissionRequirement, authenticated = true): ExecutionContext {
    class Target {
      @Permission(requirement)
      options() {}
    }
    return {
      getClass: () => Target,
      getHandler: () => Target.prototype.options,
      switchToHttp: () => ({
        getRequest: () => ({ user: authenticated ? { uid: 7 } : undefined }),
      }),
    } as unknown as ExecutionContext
  }

  beforeEach(() => {
    jest.clearAllMocks()
    guard = new RbacAuthGuard()
    Object.assign(guard, { reflector: new Reflector(), cacheService })
  })

  it.each(optionsPermissions)(
    'allows %s alone for advertisement merchant options',
    async (permission) => {
      cacheService.getPermissions.mockResolvedValue([permission])
      await expect(guard.canActivate(context({ anyOf: optionsPermissions }))).resolves.toBe(true)
    },
  )

  it('rejects unrelated merchant-account permissions and empty alternatives', async () => {
    cacheService.getPermissions.mockResolvedValue(['merchant:account:read'])
    await expect(guard.canActivate(context({ anyOf: optionsPermissions }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(guard.canActivate(context({ anyOf: [] }))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
  })

  it('requires authentication before evaluating alternatives', async () => {
    await expect(
      guard.canActivate(context({ anyOf: optionsPermissions }, false)),
    ).rejects.toBeInstanceOf(UnauthorizedException)
    expect(cacheService.getPermissions).not.toHaveBeenCalled()
  })

  it('preserves string checks and the existing all-required array behavior', async () => {
    cacheService.getPermissions.mockResolvedValue(['merchant:ad:read'])
    await expect(guard.canActivate(context('merchant:ad:read'))).resolves.toBe(true)
    await expect(guard.canActivate(context('merchant:ad:sync'))).rejects.toBeInstanceOf(
      ForbiddenException,
    )
    await expect(
      guard.canActivate(context(['merchant:ad:read', 'merchant:ad:sync'])),
    ).rejects.toBeInstanceOf(ForbiddenException)
    cacheService.getPermissions.mockResolvedValue(['merchant:ad:read', 'merchant:ad:sync'])
    await expect(
      guard.canActivate(context(['merchant:ad:read', 'merchant:ad:sync'])),
    ).resolves.toBe(true)
  })
})
