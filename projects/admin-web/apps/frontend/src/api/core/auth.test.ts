import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bindOPTApi, unbindOPTApi } from './auth';

const requestMocks = vi.hoisted(() => ({
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('authentication OTP API', () => {
  beforeEach(() => {
    requestMocks.put.mockReset();
  });

  it('uses the backend OTP binding route', async () => {
    await bindOPTApi({ code: '123456', uuid: 'otp-uuid' });

    expect(requestMocks.put).toHaveBeenCalledWith('/auth/enabledOtp', {
      code: '123456',
      uuid: 'otp-uuid',
    });
  });

  it('uses the backend OTP unbinding route', async () => {
    await unbindOPTApi('654321');

    expect(requestMocks.put).toHaveBeenCalledWith('/auth/disabledOtp/654321');
  });
});
