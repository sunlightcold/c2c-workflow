import { describe, expect, it, vi } from 'vitest';

import {
  toTenantFilterOptions,
  useBusinessTenantFilter,
} from './use-business-tenant-filter';

vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: {} }),
}));

const { getTenantsApi } = vi.hoisted(() => ({ getTenantsApi: vi.fn() }));
vi.mock('#/api', () => ({ getTenantsApi }));

const tenants = [
  {
    id: 'agent-1',
    name: '代理商一',
    status: 'active',
    type: 'AGENT',
  },
  {
    id: 'hq-1',
    name: '总部',
    status: 'active',
    type: 'HEADQUARTERS_SELF',
  },
] as const;

describe('business tenant filter', () => {
  it('marks disabled units and labels the self-operated unit explicitly', () => {
    expect(
      toTenantFilterOptions([
        ...tenants,
        {
          id: 'agent-2',
          name: '代理商二',
          status: 'disabled',
          type: 'AGENT',
        },
      ] as any),
    ).toEqual([
      { disabled: false, label: '代理商一', value: 'agent-1' },
      { disabled: false, label: '总部（总部自营）', value: 'hq-1' },
      { disabled: true, label: '代理商二', value: 'agent-2' },
    ]);
  });

  it('defaults platform users to the active headquarters unit', async () => {
    getTenantsApi.mockResolvedValueOnce(tenants);
    const { loadTenantOptions } = useBusinessTenantFilter();
    await expect(loadTenantOptions()).resolves.toBe('hq-1');
  });
});
