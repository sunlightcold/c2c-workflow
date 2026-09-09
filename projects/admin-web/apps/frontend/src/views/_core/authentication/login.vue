<script lang="ts" setup>
import type { AuthenticationInstance } from '#/components/authentication/types';
import type { FormCreateProps } from '#/hooks';

import { $t } from '@vben/locales';

defineOptions({ name: 'Login' });
const authStore = useAuthStore();

const authRef = ref<AuthenticationInstance>();
const formCreateProps = reactive<FormCreateProps>({
  option: {
    resetBtn: false,
    submitBtn: false,
    form: {
      hideRequiredMark: true,
      layout: 'vertical',
    },
  },
  rule: [
    {
      type: 'input',
      field: 'username',
      value: '',
      props: {
        placeholder: $t('authentication.username'),
        size: 'large',
      },
      validate: [
        {
          required: true,
          type: 'string',
          message: $t('authentication.usernameTip'),
        },
      ],
    },
    {
      type: 'input',
      field: 'password',
      value: '',
      props: {
        placeholder: $t('authentication.password'),
        type: 'password',
        size: 'large',
      },
      validate: [
        {
          required: true,
          type: 'string',
          message: $t('authentication.passwordTip'),
        },
      ],
    },
    {
      type: 'input',
      field: 'uuid',
      value: '',
      hidden: true,
    },
    {
      type: 'input',
      field: 'otpCode',
      value: '',
      props: {
        placeholder: $t('authentication.otpCode'),
        type: 'otpCode',
        size: 'large',
      },
      validate: [
        {
          required: true,
          type: 'string',
          message: $t('authentication.otpCodeTip'),
        },
      ],
    },
    {
      type: 'input',
      field: 'uuid',
      value: '',
      hidden: true,
    },
  ],
});
</script>

<template>
  <Authentication
    ref="authRef"
    :form-create-props="formCreateProps"
    :loading="authStore.loginLoading"
    @submit="authStore.authLogin"
  />
</template>
