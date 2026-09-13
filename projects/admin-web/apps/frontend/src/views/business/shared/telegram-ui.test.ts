import { describe, expect, it } from 'vitest';

import { telegramBotTypeOptions } from './telegram-ui';

describe('telegram bot type options', () => {
  it('offers one payment bot type', () => {
    expect(telegramBotTypeOptions).toEqual([
      { label: '支付机器人', value: 'PAYMENT' },
    ]);
  });
});
