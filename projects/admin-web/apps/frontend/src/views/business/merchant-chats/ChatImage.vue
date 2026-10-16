<script lang="ts" setup>
import type { MerchantChatApi } from '#/api';

import { onBeforeUnmount, ref, watch } from 'vue';

import { getMerchantChatImageApi } from '#/api';

import { downloadChatImage } from './image-download';

const props = defineProps<{
  instanceId: string;
  message: MerchantChatApi.Message;
  scope: MerchantChatApi.Scope;
}>();
const source = ref('');
const failed = ref(false);
const loading = ref(false);
let version = 0;
function clear() {
  if (source.value) URL.revokeObjectURL(source.value);
  source.value = '';
}
async function load() {
  const current = ++version;
  clear();
  loading.value = true;
  failed.value = false;
  try {
    const blob = await downloadChatImage(() =>
      current === version
        ? getMerchantChatImageApi(props.scope, props.instanceId, props.message)
        : Promise.resolve(undefined),
    );
    if (current === version && blob) source.value = URL.createObjectURL(blob);
  } catch {
    if (current === version) failed.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}
watch(
  [
    () => props.scope.tenantId,
    () => props.scope.merchantId,
    () => props.instanceId,
    () => props.message.id,
    () => props.message.attachmentId,
  ],
  load,
  { immediate: true },
);
onBeforeUnmount(() => {
  version++;
  clear();
});
</script>

<template>
  <div class="flex min-h-24 min-w-40 items-center justify-center">
    <a-spin v-if="loading" size="small" />
    <a-image
      v-else-if="source"
      :src="source"
      alt="聊天图片"
      class="max-h-64 max-w-full rounded"
    />
    <div v-else-if="failed" class="text-muted-foreground text-sm" role="status">
      <p>图片暂不可读取或已过期</p>
      <a-button type="link" size="small" @click="load">重试</a-button>
    </div>
  </div>
</template>
