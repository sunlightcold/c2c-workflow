<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { AuthenticationProps } from './types';

import type { FormCreateProps } from '#/hooks';

import { $t } from '@vben/locales';

import { useFormCreate } from '#/hooks';

import Title from './auth-title.vue';

interface Props extends AuthenticationProps {
  formCreateProps: FormCreateProps;
}

defineOptions({
  name: 'AuthenticationLogin',
});

const props = withDefaults(defineProps<Props>(), {
  codeLoginPath: '/auth/code-login',
  forgetPasswordPath: '/auth/forget-password',
  formSchema: () => [],
  loading: false,
  qrCodeLoginPath: '/auth/qrcode-login',
  registerPath: '/auth/register',
  showCodeLogin: true,
  showForgetPassword: true,
  showQrcodeLogin: true,
  showRegister: true,
  showRememberMe: true,
  showThirdPartyLogin: true,
  submitButtonText: '',
  subTitle: '',
  title: '',
});

const emit = defineEmits<{
  submit: [Recordable<any>];
}>();

const [FormCreate, fApi] = useFormCreate(props.formCreateProps);

const REMEMBER_ME_KEY = `REMEMBER_ME_USERNAME_${location.hostname}`;

const localUsername = localStorage.getItem(REMEMBER_ME_KEY) || '';

const rememberMe = ref(!!localUsername);

function handleSubmit() {
  fApi.value.validate().then(() => {
    const values = fApi.value.formData();
    localStorage.setItem(
      REMEMBER_ME_KEY,
      rememberMe.value ? values?.username : '',
    );
    emit('submit', values);
  });
}

onMounted(() => {
  if (localUsername) {
    fApi.value.setValue('username', localUsername);
  }
});

defineExpose({
  getFormApi: () => fApi.value,
});
</script>

<template>
  <div @keydown.enter.prevent="handleSubmit">
    <slot name="title">
      <Title>
        <slot name="title">
          {{ title || `${$t('authentication.welcomeBack')} 👋🏻` }}
        </slot>
        <template #desc>
          <span class="text-muted-foreground">
            <slot name="subTitle">
              {{ subTitle || $t('authentication.loginSubtitle') }}
            </slot>
          </span>
        </template>
      </Title>
    </slot>

    <FormCreate />

    <div
      v-if="showRememberMe || showForgetPassword"
      class="mb-6 flex justify-between"
    >
      <div class="flex-center">
        <ACheckbox
          v-if="showRememberMe"
          v-model:checked="rememberMe"
          name="rememberMe"
        >
          {{ $t('authentication.rememberMe') }}
        </ACheckbox>
      </div>
    </div>
    <AButton
      :class="{
        'cursor-wait': loading,
      }"
      :loading="loading"
      aria-label="login"
      class="w-full"
      type="primary"
      @click="handleSubmit"
    >
      {{ submitButtonText || $t('common.login') }}
    </AButton>
  </div>
</template>
