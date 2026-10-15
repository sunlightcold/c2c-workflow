import { reactive, ref } from 'vue';

import { getAdMerchantOptionsApi } from '#/api';

import { merchantPlatformText } from './business-ui';
import { useBusinessTenantFilter } from './use-business-tenant-filter';

export function useAdMerchantFilter() {
  const { fixedTenantId, loadTenantOptions, tenantOptions } =
    useBusinessTenantFilter();
  const selectedTenantId = ref('');
  const merchantOptions = reactive<Array<{ label: string; value: string }>>([]);

  async function loadMerchants(tenantId: string) {
    selectedTenantId.value = tenantId;
    const merchants = await getAdMerchantOptionsApi({ tenantId });
    merchantOptions.splice(
      0,
      merchantOptions.length,
      ...merchants.map(({ id, name, platform }) => ({
        label: `${name} · ${merchantPlatformText(platform)}`,
        value: id,
      })),
    );
  }

  return {
    fixedTenantId,
    loadMerchants,
    loadTenantOptions,
    merchantOptions,
    selectedTenantId,
    tenantOptions,
  };
}
