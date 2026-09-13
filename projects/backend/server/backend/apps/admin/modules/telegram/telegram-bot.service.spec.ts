import { ConflictException } from '@nestjs/common'
import { BusinessStatus, TelegramGroupBindingState } from '@admin/database'
import { TelegramBotService } from './telegram-bot.service'
import { TelegramBotType, TelegramCapability } from './telegram-policy'

describe('TelegramBotService', () => {
  const bot = {
    id: 'bot-1',
    tenantId: 'tenant-1',
    code: 'PAY_MAIN',
    botType: TelegramBotType.PAYMENT,
    name: 'Main bot',
    tokenRef: 'env://BOT_TOKEN',
    webhookSecretRef: null,
    capabilities: [TelegramCapability.ORDER_QUERY, TelegramCapability.MANUAL_PAYMENT],
    status: BusinessStatus.ACTIVE,
  }
  const queryBuilder = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue({ ...bot }),
  }
  const bots = {
    create: jest.fn((value) => value),
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    save: jest.fn(async (value) => value),
  }
  const groups = {
    find: jest.fn().mockResolvedValue([
      {
        bindingState: TelegramGroupBindingState.ACTIVE,
        capabilities: [TelegramCapability.MANUAL_PAYMENT],
      },
    ]),
  }

  beforeEach(() => jest.clearAllMocks())

  it('creates a bot with a server-generated business code', async () => {
    const service = new TelegramBotService(bots as never, groups as never)

    await service.create('tenant-1', {
      name: 'Main bot',
      botType: TelegramBotType.PAYMENT,
      tokenRef: 'env://BOT_TOKEN',
      capabilities: [TelegramCapability.ORDER_QUERY],
    })

    expect(bots.save).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringMatching(/^BOT\d{20}$/) }),
    )
  })

  it('accepts a Telegram Bot Token and stores only an encrypted reference', async () => {
    const cipher = { encrypt: jest.fn().mockReturnValue('ciphertext') }
    const service = new TelegramBotService(bots as never, groups as never, cipher as never)

    await service.create('tenant-1', {
      name: 'Main bot',
      botType: TelegramBotType.PAYMENT,
      token: '8929220627:AAabcdefghijklmnopQRST',
      capabilities: [TelegramCapability.ORDER_QUERY],
    })

    expect(cipher.encrypt).toHaveBeenCalledWith('8929220627:AAabcdefghijklmnopQRST')
    expect(bots.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tokenRef: 'enc://ciphertext',
        webhookSecretRef: null,
        webhookUrl: null,
      }),
    )
  })

  it('does not remove a capability still used by a bound group', async () => {
    const service = new TelegramBotService(bots as never, groups as never)
    await expect(
      service.update('tenant-1', 'bot-1', {
        capabilities: [TelegramCapability.ORDER_QUERY],
      }),
    ).rejects.toThrow(new ConflictException('机器人能力仍被群组使用，请先调整群组能力'))
    expect(bots.save).not.toHaveBeenCalled()
  })

  it('reports Secret configuration from the stored references', async () => {
    const listQuery = {
      addSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ ...bot }], 1]),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
    }
    const listBots = { createQueryBuilder: jest.fn().mockReturnValue(listQuery) }
    const service = new TelegramBotService(listBots as never, groups as never)

    const result = await service.list('tenant-1', { page: 1, pageSize: 20 })

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        tokenConfigured: true,
      }),
    )
    expect(result.items[0]).not.toHaveProperty('tokenRef')
    expect(result.items[0]).not.toHaveProperty('webhookSecretRef')
    expect(result.items[0]).not.toHaveProperty('webhookUrl')
  })
})
