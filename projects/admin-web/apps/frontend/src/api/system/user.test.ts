import { describe, expect, it } from 'vitest';

import { normalizeCurrentUserInfo } from './user-normalizer';

describe('normalizeCurrentUserInfo', () => {
  it('maps backend id to the uid field used by the frontend user store', () => {
    const userInfo = normalizeCurrentUserInfo({
      id: 1,
      isOtpEnabled: false,
      nickname: 'superAdmin',
      username: 'superAdmin',
    } as any);

    expect(userInfo.uid).toBe('1');
  });

  it('keeps uid when the backend already returns it', () => {
    const userInfo = normalizeCurrentUserInfo({
      id: 1,
      isOtpEnabled: false,
      nickname: 'operator',
      uid: '99',
      username: 'operator',
    } as any);

    expect(userInfo.uid).toBe('99');
  });
});
