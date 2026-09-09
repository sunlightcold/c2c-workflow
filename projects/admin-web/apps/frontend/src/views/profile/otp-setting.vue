<script setup lang="ts">
import type { UserInfo } from '@vben/types';

import { computed, h, ref } from 'vue';

import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { Input, message, Modal, notification } from 'ant-design-vue';

import { bindOPTApi, getOPTUrlApi, unbindOPTApi } from '#/api';
import { useAuthStore } from '#/store';
import OtpBinding from '#/views/dashboard/info/otp-binding.vue';

const userStore = useUserStore();
const authStore = useAuthStore();

const userInfo = computed(() => userStore.userInfo as null | UserInfo);
const loading = ref(false);

const otpEnabled = computed(() => !!userInfo.value?.isOtpEnabled);

async function bindingOtp() {
  const { uri, uuid } = await getOPTUrlApi();
  const code = ref('');
  Modal.confirm({
    centered: true,
    content: h(OtpBinding, {
      modelValue: code.value,
      'onUpdate:modelValue': (val: string = '') => (code.value = val),
      uri,
    }),
    title: $t('authentication.otpBindTitle'),
    width: 500,
    async onOk() {
      if (code.value && code.value.length === 6) {
        await bindOPTApi({ code: code.value, uuid });
        await authStore.fetchUserInfo();
        message.success($t('authentication.otpBindSuccess'));
      } else {
        const errorMessage = $t('authentication.otpInvalidTip');
        message.error(errorMessage);
        throw new Error(errorMessage);
      }
    },
  });
}

async function unbindOtp() {
  const code = ref<string | undefined>('');
  Modal.confirm({
    centered: true,
    content: h(Input, {
      onChange: (e) => (code.value = e.target.value),
      placeholder: $t('authentication.otpInputPlaceholder'),
      value: code.value,
    }),
    title: $t('authentication.otpVerifyTitle'),
    async onOk() {
      await unbindOPTApi(code.value ?? '');
      await authStore.fetchUserInfo();
      notification.success({ message: $t('authentication.otpUnbindSuccess') });
    },
  });
}

async function handleOtpAction() {
  loading.value = true;
  try {
    await (otpEnabled.value ? unbindOtp() : bindingOtp());
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="otp-panel">
    <div class="otp-state">
      <span>{{ $t('authentication.otpAuthenticator') }}</span>
      <ATag :color="otpEnabled ? 'success' : 'default'">
        {{
          otpEnabled
            ? $t('authentication.otpBound')
            : $t('authentication.otpUnbound')
        }}
      </ATag>
    </div>
    <AButton
      :danger="otpEnabled"
      :loading="loading"
      type="primary"
      @click="handleOtpAction"
    >
      {{
        otpEnabled
          ? $t('authentication.otpUnbind')
          : $t('authentication.otpBind')
      }}
    </AButton>
  </div>
</template>

<style lang="scss" scoped>
.otp-panel {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  max-width: 520px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.otp-state {
  display: flex;
  gap: 10px;
  align-items: center;

  span {
    font-size: 14px;
    font-weight: 500;
  }
}

@media (max-width: 560px) {
  .otp-panel {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
