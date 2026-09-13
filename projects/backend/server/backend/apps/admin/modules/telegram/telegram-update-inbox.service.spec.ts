import { TelegramUpdateInboxService } from './telegram-update-inbox.service'

describe('TelegramUpdateInboxService', () => {
  const execute = jest.fn().mockResolvedValue({ identifiers: [{ id: 'update-1' }] })
  const insert = {
    values: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orIgnore: jest.fn().mockReturnThis(),
    execute,
  }
  const updates = { createQueryBuilder: jest.fn().mockReturnValue({ insert: () => insert }) }
  const botQuery = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({
      id: 'bot-1',
      tenantId: 'tenant-1',
      webhookSecretRef: 'env://TG_WEBHOOK_SECRET',
    }),
  }
  const bots = { createQueryBuilder: jest.fn().mockReturnValue(botQuery) }

  beforeEach(() => {
    process.env.TG_WEBHOOK_SECRET = 'secret-value'
    jest.clearAllMocks()
  })
  afterAll(() => {
    delete process.env.TG_WEBHOOK_SECRET
  })

  it('stores a verified update with a database uniqueness boundary', async () => {
    const service = new TelegramUpdateInboxService(bots as never, updates as never)
    await expect(service.receive('PAY_MAIN', 'secret-value', { update_id: 123 })).resolves.toEqual({
      accepted: true,
    })
    expect(insert.orIgnore).toHaveBeenCalled()
    expect(insert.setParameter).toHaveBeenCalledWith('payload', '{"update_id":123}')
    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({ botId: 'bot-1', updateId: '123' }),
    )
  })

  it('accepts updates without a webhook secret when the bot only has a token configured', async () => {
    botQuery.getOne.mockResolvedValueOnce({
      id: 'bot-1',
      tenantId: 'tenant-1',
      webhookSecretRef: null,
    })

    const service = new TelegramUpdateInboxService(bots as never, updates as never)
    await expect(service.receive('PAY_MAIN', undefined, { update_id: 124 })).resolves.toEqual({
      accepted: true,
    })
  })
})
