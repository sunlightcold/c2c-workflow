import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getDashboardOverviewApi } from './dashboard';

const requestMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('dashboard api', () => {
  beforeEach(() => requestMocks.get.mockReset());

  it('loads one tenant-scoped dashboard aggregation for the selected range', async () => {
    requestMocks.get.mockResolvedValue({ dailyTrend: [], summary: {} });

    await getDashboardOverviewApi({ days: 14, tenantId: 'tenant-1' });

    expect(requestMocks.get).toHaveBeenCalledWith('/sys/dashboard/overview', {
      params: { days: 14, tenantId: 'tenant-1' },
    });
  });
});
