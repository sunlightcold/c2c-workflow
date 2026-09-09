<script setup lang="ts">
import type { Recordable } from '@vben/types';

import type { VbenFormSchema } from '#/adapter/form';

import { computed, ref } from 'vue';

import { ProfilePasswordSetting, z } from '@vben/common-ui';
import { $t } from '@vben/locales';

import { message } from 'ant-design-vue';

import { modifyPwdApi } from '#/api';

const loading = ref(false);
const profilePasswordSettingRef = ref();

const PASSWORD_MIN_LENGTH = 6;

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'VbenInputPassword',
      componentProps: {
        placeholder: $t('authentication.oldPasswordTip'),
      },
      fieldName: 'oldPassword',
      label: $t('authentication.oldPassword'),
      rules: z
        .string({ required_error: $t('authentication.oldPasswordTip') })
        .min(PASSWORD_MIN_LENGTH, {
          message: $t('authentication.passwordMinLengthTip', [
            PASSWORD_MIN_LENGTH,
          ]),
        }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.newPasswordTip'),
      },
      fieldName: 'newPassword',
      label: $t('authentication.newPassword'),
      rules: z
        .string({ required_error: $t('authentication.newPasswordTip') })
        .min(PASSWORD_MIN_LENGTH, {
          message: $t('authentication.passwordMinLengthTip', [
            PASSWORD_MIN_LENGTH,
          ]),
        }),
    },
    {
      component: 'VbenInputPassword',
      componentProps: {
        passwordStrength: true,
        placeholder: $t('authentication.confirmNewPasswordTip'),
      },
      dependencies: {
        rules(values) {
          const { newPassword } = values;
          return z
            .string({
              required_error: $t('authentication.confirmNewPasswordTip'),
            })
            .min(1, {
              message: $t('authentication.confirmNewPasswordTip'),
            })
            .refine((value) => value === newPassword, {
              message: $t('authentication.confirmPasswordTip'),
            });
        },
        triggerFields: ['newPassword'],
      },
      fieldName: 'confirmPassword',
      label: $t('authentication.confirmPassword'),
    },
    {
      component: 'Input',
      componentProps: {
        maxlength: 6,
        placeholder: $t('authentication.otpCodeWhenBoundPlaceholder'),
      },
      fieldName: 'code',
      label: $t('authentication.otpCode'),
    },
  ];
});

async function handleSubmit({
  code,
  oldPassword,
  newPassword,
}: Recordable<any>) {
  loading.value = true;
  try {
    await modifyPwdApi({
      code: code || undefined,
      newPwd: newPassword,
      oldPwd: oldPassword,
    });
    message.success($t('authentication.passwordChangedSuccess'));
    profilePasswordSettingRef.value?.getFormApi().resetForm();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ProfilePasswordSetting
    ref="profilePasswordSettingRef"
    class="profile-password-form"
    :form-schema="formSchema"
    :loading="loading"
    @submit="handleSubmit"
  />
</template>

<style lang="scss" scoped>
.profile-password-form {
  max-width: 520px;
}
</style>
