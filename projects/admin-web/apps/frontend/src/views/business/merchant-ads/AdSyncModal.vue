<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';

import { syncMerchantAdsApi } from '#/api';
import { runResourceAction } from '#/hooks';

import { BUSINESS_MODAL_Z_INDEX } from '../shared/business-form-layout';
import { useAdMerchantFilter } from '../shared/use-ad-merchant-filter';

const emit = defineEmits<{ synced: [] }>();
const open = defineModel<boolean>('open', { required: true });
const {
  fixedTenantId,
  loadMerchants,
  loadTenantOptions,
  merchantOptions,
  tenantOptions,
} = useAdMerchantFilter();
const draft = reactive({ merchantId: '', tenantId: '' });
const loading = ref(true);
const syncing = ref(false);
const rules = {
  merchantId: [{ message: '请选择商家账号', required: true }],
  tenantId: [{ message: '请选择经营单位', required: true }],
};

async function selectTenant() {
  draft.merchantId = '';
  merchantOptions.splice(0);
  loading.value = true;
  try {
    await loadMerchants(draft.tenantId);
  } finally {
    loading.value = false;
  }
}

async function syncAds() {
  const { merchantId, tenantId } = draft;
  syncing.value = true;
  try {
    await runResourceAction({
      action: () => syncMerchantAdsApi(merchantId, { tenantId }),
      onSuccess: () => {
        open.value = false;
        emit('synced');
      },
      successMessage: '买 USDT 广告同步完成',
    });
  } finally {
    syncing.value = false;
  }
}

onMounted(async () => {
  try {
    draft.tenantId = await loadTenantOptions();
    if (draft.tenantId) await selectTenant();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <AModal
    v-model:open="open"
    centered
    title="同步广告"
    width="min(480px, 94vw)"
    :z-index="BUSINESS_MODAL_Z_INDEX"
  >
    <AForm
      id="merchant-ad-sync-form"
      :disabled="loading || syncing"
      layout="vertical"
      :model="draft"
      :rules="rules"
      @finish="syncAds"
    >
      <AFormItem label="经营单位" name="tenantId">
        <ASelect
          v-model:value="draft.tenantId"
          aria-label="经营单位"
          :disabled="Boolean(fixedTenantId) || loading || syncing"
          option-filter-prop="label"
          :options="tenantOptions"
          placeholder="请选择经营单位"
          show-search
          @change="selectTenant"
        />
      </AFormItem>
      <AFormItem label="商家账号" name="merchantId">
        <ASelect
          v-model:value="draft.merchantId"
          aria-label="商家账号"
          :loading="loading"
          option-filter-prop="label"
          :options="merchantOptions"
          placeholder="请选择商家账号"
          show-search
        />
      </AFormItem>
    </AForm>
    <template #footer>
      <AButton @click="open = false">取消</AButton>
      <AButton
        :disabled="loading"
        form="merchant-ad-sync-form"
        html-type="submit"
        :loading="syncing"
        type="primary"
      >
        开始同步
      </AButton>
    </template>
  </AModal>
</template>
