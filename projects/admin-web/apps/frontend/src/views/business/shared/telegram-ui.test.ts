import { describe, expect, it } from 'vitest';

import {
  telegramBotTypeOptions,
  telegramCapabilityOptions,
} from './telegram-ui';

describe('telegram bot type options', () => {
  it('offers one payment bot type', () => {
    expect(telegramBotTypeOptions).toEqual([
      { label: '支付机器人', value: 'PAYMENT' },
    ]);
  });
});

describe('telegram capability options', () => {
  it('offers OTC query configuration management', () => {
    expect(telegramCapabilityOptions).toContainEqual({
      label: 'OTC 查询配置管理',
      value: 'OTC_CONFIG_MANAGE',
    });
  });
});
