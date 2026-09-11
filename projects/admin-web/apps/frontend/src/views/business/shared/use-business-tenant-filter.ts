import type { BusinessApi } from '#/api';

import { computed } from 'vue';

import { useUserStore } from '@vben/stores';

import { getTenantsApi } from '#/api';

type TenantOptionSource = Pick<
  BusinessApi.Tenant,
  'id' | 'name' | 'status' | 'type'
>;

export function toTenantFilterOptions(tenants: readonly TenantOptionSource[]) {
  return tenants.map((tenant) => ({
    disabled: tenant.status !== 'active',
    label:
      tenant.type === 'HEADQUARTERS_SELF'
        ? `${tenant.name}（总部自营）`
        : tenant.name,
    value: tenant.id,
  }));
}

export function chooseDefaultTenantId(tenants: readonly TenantOptionSource[]) {
  return (
    tenants.find(
      (tenant) =>
        tenant.type === 'HEADQUARTERS_SELF' && tenant.status === 'active',
    )?.id ??
    tenants.find((tenant) => tenant.status === 'active')?.id ??
    ''
  );
}

export function useBusinessTenantFilter() {
  const userStore = useUserStore();
  const fixedTenantId = computed(
    () =>
      (
        userStore.userInfo as typeof userStore.userInfo & {
          tenantId?: null | string;
        }
      )?.tenantId ?? undefined,
  );
  const tenantOptions: Array<{
    disabled?: boolean;
    label: string;
    value: string;
  }> = [];

  async function loadDefaultTenantId() {
    if (fixedTenantId.value) {
      tenantOptions.splice(0, tenantOptions.length, {
        label: '当前经营单位',
        value: fixedTenantId.value,
      });
      return fixedTenantId.value;
    }
    const tenants = await getTenantsApi();
    tenantOptions.splice(
      0,
      tenantOptions.length,
      ...toTenantFilterOptions(tenants),
    );
    return chooseDefaultTenantId(tenants);
  }

  return { fixedTenantId, loadDefaultTenantId, tenantOptions };
}
