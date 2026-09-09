<script lang="ts" setup>
import type { UserInfo } from '@vben/types';

import type { AuthApi } from '#/api';

import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { Input, message, Modal, notification } from 'ant-design-vue';

import { bindOPTApi, getOPTUrlApi, modifyPwdApi, unbindOPTApi } from '#/api';
import { useFormModal } from '#/hooks';

import OtpBinding from './otp-binding.vue';
import { modifyPwdModalOptions } from './schema';

const userStore = useUserStore();
const authStore = useAuthStore();

const userInfo = computed(() => userStore.userInfo as UserInfo);
const { FormModalRender, formModalShow, formModalClose } = useFormModal();

async function bindingOtp() {
  const { uri, uuid } = await getOPTUrlApi();
  const code = ref('');
  Modal.confirm({
    title: $t('authentication.otpBindTitle'),
    content: h(OtpBinding, {
      uri,
      modelValue: code.value,
      'onUpdate:modelValue': (val: string = '') => (code.value = val),
    }),
    centered: true,
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
  handleCodeModal(async (code) => {
    await unbindOPTApi(code);
    await authStore.fetchUserInfo();
    notification.success({ message: $t('authentication.otpUnbindSuccess') });
  });
}

async function handleCodeModal(onOk: (code: string) => Promise<void>) {
  const code = ref<string | undefined>('');
  Modal.confirm({
    title: $t('authentication.otpVerifyTitle'),
    content: h(Input, {
      placeholder: $t('authentication.otpInputPlaceholder'),
      value: code.value,
      onChange: (e) => (code.value = e.target.value),
    }),
    centered: true,
    onOk: async () => {
      await onOk(code.value ?? '');
    },
  });
}

function onModifyPwd() {
  formModalShow(modifyPwdModalOptions, {
    onOk: async (api) => {
      await api.validate().then(async () => {
        const formValue = api.formData();
        await modifyPwdApi(formValue as AuthApi.ModifyPwdParams);
        notification.success({
          message: $t('authentication.modifyPasswordSuccessRelogin'),
        });
        formModalClose();
        const authStore = useAuthStore();
        authStore.logout(true);
      });
    },
  });
}
</script>

<template>
  <ACard class="m-4" :bordered="false">
    <FormModalRender />
    <ADescriptions :title="$t('authentication.profileBasicInfo')">
      <ADescriptionsItem :label="$t('authentication.profileLoginName')">
        {{ userInfo?.username }}
      </ADescriptionsItem>
      <ADescriptionsItem :label="$t('authentication.profileNickname')">
        {{ userInfo?.nickname }}
      </ADescriptionsItem>
    </ADescriptions>
    <ADivider />
    <ADescriptions :title="$t('authentication.profileSecurity')">
      <ADescriptionsItem :label="$t('authentication.password')">
        <AButton type="primary" size="small" @click="onModifyPwd">
          {{ $t('authentication.modifyPassword') }}
        </AButton>
      </ADescriptionsItem>
      <ADescriptionsItem :label="$t('authentication.otpAuthenticator')">
        <ATag color="#f50">
          {{
            userInfo?.isOtpEnabled
              ? $t('authentication.otpBound')
              : $t('authentication.otpUnbound')
          }}
        </ATag>
        <AButton
          v-if="!userInfo?.isOtpEnabled"
          type="primary"
          size="small"
          @click="bindingOtp"
        >
          {{ $t('authentication.otpBind') }}
        </AButton>
        <AButton v-else type="primary" danger size="small" @click="unbindOtp">
          {{ $t('authentication.otpUnbind') }}
        </AButton>
      </ADescriptionsItem>
    </ADescriptions>
  </ACard>
</template>
