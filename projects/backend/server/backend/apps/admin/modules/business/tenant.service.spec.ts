import { TenantService } from './tenant.service'

describe('TenantService', () => {
  const repository = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  }
  const service = new TenantService(repository as never)

  beforeEach(() => jest.clearAllMocks())

  it('creates an agent with a server-generated business code', async () => {
    await service.create({ name: '代理商一', timezone: 'Asia/Shanghai' })

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringMatching(/^AGT\d{20}$/) }),
    )
  })
})
