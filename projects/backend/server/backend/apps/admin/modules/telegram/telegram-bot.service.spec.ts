import { ConflictException } from '@nestjs/common'
import { BusinessStatus, TelegramGroupBindingState } from '@admin/database'
import { TelegramBotService } from './telegram-bot.service'
import { TelegramCapability } from './telegram-policy'

describe('TelegramBotService', () => {
  const bot = {
    id: 'bot-1',
    tenantId: 'tenant-1',
    code: 'PAY_MAIN',
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

  it('does not remove a capability still used by a bound group', async () => {
    const service = new TelegramBotService(bots as never, groups as never)
    await expect(
      service.update('tenant-1', 'bot-1', {
        capabilities: [TelegramCapability.ORDER_QUERY],
      }),
    ).rejects.toThrow(new ConflictException('机器人能力仍被群组使用，请先调整群组能力'))
    expect(bots.save).not.toHaveBeenCalled()
  })
})
