<script lang="ts" setup>
import type { OtpBindingProps } from './type';

import { $t } from '@vben/locales';

import { QrCode } from '#/components';

withDefaults(defineProps<OtpBindingProps>(), {});
const codeModel = defineModel<string>();

const code = ref(codeModel.value || '');

watch(code, (newVal) => {
  codeModel.value = newVal;
});
</script>

<template>
  <div class="-ml-[34px] flex flex-col items-center justify-center gap-2">
    <QrCode :value="uri" type="image/png" />
    <AInput
      class="w-48"
      :placeholder="$t('authentication.otpInputPlaceholder')"
      v-model:value="code"
    />
  </div>
</template>
