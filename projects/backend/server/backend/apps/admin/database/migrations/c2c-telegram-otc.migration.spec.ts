import { migrateC2cTelegramOtc } from './c2c-telegram-otc.migration'

describe('migrateC2cTelegramOtc', () => {
  it('creates scoped configuration and grants management only to admin members', async () => {
    const manager = { query: jest.fn().mockResolvedValue([]) }

    await migrateC2cTelegramOtc(manager as never)

    const statements = manager.query.mock.calls.map(([sql]) => String(sql))
    expect(statements.join('\n')).toContain('CREATE TABLE IF NOT EXISTS telegram_otc_config')
    expect(statements.join('\n')).toContain('"tenantId", "botId", "chatId"')
    expect(statements.join('\n')).toContain("members.role = 'ADMIN'")
    expect(statements.join('\n')).not.toContain("members.role = 'OPERATOR'")
    expect(
      manager.query.mock.calls.filter(([, params]) => params?.[0] === 'OTC_CONFIG_MANAGE'),
    ).toHaveLength(3)
  })
})
