<script lang="ts" setup>
import type { BusinessApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { useUserStore } from '@vben/stores';

import { getTenantsApi } from '#/api';

const emit = defineEmits<{ ready: [tenantId: string] }>();
const model = defineModel<string>();

const userStore = useUserStore();
const tenants = ref<BusinessApi.Tenant[]>([]);
const loading = ref(false);
const currentUser = computed(
  () =>
    userStore.userInfo as typeof userStore.userInfo & {
      actorType?: 'PLATFORM' | 'TENANT';
      tenantId?: null | string;
    },
);
const fixedTenant = computed(() => currentUser.value?.tenantId ?? undefined);

onMounted(async () => {
  if (fixedTenant.value) {
    model.value = fixedTenant.value;
    emit('ready', fixedTenant.value);
    return;
  }
  loading.value = true;
  try {
    tenants.value = await getTenantsApi();
  } finally {
    loading.value = false;
  }
});

function onChange(value: unknown) {
  if (typeof value === 'string') emit('ready', value);
}
</script>

<template>
  <div class="business-scope">
    <span class="business-scope__label">经营单位</span>
    <ASelect
      v-if="!fixedTenant"
      v-model:value="model"
      :loading="loading"
      :options="
        tenants.map((tenant) => ({
          disabled: tenant.status !== 'active',
          label:
            tenant.type === 'HEADQUARTERS_SELF'
              ? `${tenant.name}（总部自营）`
              : tenant.name,
          value: tenant.id,
        }))
      "
      aria-label="选择经营单位"
      placeholder="选择总部自营或代理商"
      show-search
      style="min-width: 240px"
      @change="onChange"
    />
    <ATag v-else color="blue">当前所属单位</ATag>
  </div>
</template>

<style scoped>
.business-scope {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: 40px;
}

.business-scope__label {
  font-size: 14px;
  font-weight: 500;
  color: hsl(var(--foreground));
}
</style>
