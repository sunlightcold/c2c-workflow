import { describe, expect, it, vi } from 'vitest';

import {
  chooseDefaultTenantId,
  toTenantFilterOptions,
} from './use-business-tenant-filter';

vi.mock('@vben/stores', () => ({
  useUserStore: () => ({ userInfo: {} }),
}));

vi.mock('#/api', () => ({
  getTenantsApi: vi.fn(),
}));

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
  it('prefers the headquarters self-operated unit for platform users', () => {
    expect(chooseDefaultTenantId(tenants as any)).toBe('hq-1');
  });

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
});
