import { ForbiddenException } from '@nestjs/common'
import { ActorType } from '@/common/interfaces'
import { BusinessScopeService } from './business-scope.service'

describe('BusinessScopeService', () => {
  const service = new BusinessScopeService()
  const tenantId = '00000000-0000-4000-8000-000000000010'

  it('uses the authenticated tenant for tenant actors', () => {
    expect(
      service.resolveTenantId({ uid: 1, username: 'agent', actorType: ActorType.TENANT, tenantId }),
    ).toBe(tenantId)
  })

  it('rejects a tenant actor attempting to address another tenant', () => {
    expect(() =>
      service.resolveTenantId(
        { uid: 1, username: 'agent', actorType: ActorType.TENANT, tenantId },
        '00000000-0000-4000-8000-000000000011',
      ),
    ).toThrow(ForbiddenException)
  })

  it('requires platform actors to select an operating tenant', () => {
    expect(() =>
      service.resolveTenantId({ uid: 1, username: 'hq', actorType: ActorType.PLATFORM }),
    ).toThrow(ForbiddenException)
  })
})
