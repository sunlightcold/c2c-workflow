import { TelegramInteractionState } from '@admin/database'
import { TelegramInteractionService } from './telegram-interaction.service'

describe('TelegramInteractionService', () => {
  it('atomically acquires one pending unexpired interaction', async () => {
    const query = jest.fn().mockResolvedValue([
      [
        {
          id: 'interaction-1',
          state: TelegramInteractionState.SUBMITTING,
          payload: { payments: [] },
        },
      ],
      1,
    ])
    const dataSource = { query }
    const interactions = {}
    const service = new TelegramInteractionService(dataSource as never, interactions as never)

    await expect(
      service.acquire({
        id: 'interaction-1',
        botId: 'bot-1',
        chatId: '-1001',
        telegramUserId: '88',
      }),
    ).resolves.toMatchObject({
      id: 'interaction-1',
      state: TelegramInteractionState.SUBMITTING,
    })
    expect(query).toHaveBeenCalledWith(expect.stringContaining('state = $6'), [
      'interaction-1',
      'bot-1',
      '-1001',
      '88',
      TelegramInteractionState.SUBMITTING,
      TelegramInteractionState.PENDING,
    ])
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("interval '5 minutes'"),
      expect.any(Array),
    )
  })
})
