<script setup lang="ts">
import { computed, ref } from 'vue';

import { Profile } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import ProfileBase from './base-setting.vue';
import ProfileOtpSetting from './otp-setting.vue';
import ProfilePasswordSetting from './password-setting.vue';

const userStore = useUserStore();

const tabsValue = ref<string>('basic');

const tabs = computed(() => [
  {
    description: $t('authentication.profileBasicTabDesc'),
    label: $t('authentication.profileBasicTab'),
    value: 'basic',
  },
  {
    description: $t('authentication.profileOtpTabDesc'),
    label: $t('authentication.profileOtpTab'),
    value: 'otp',
  },
  {
    description: $t('authentication.profilePasswordTabDesc'),
    label: $t('authentication.modifyPassword'),
    value: 'password',
  },
]);
</script>

<template>
  <Profile
    v-model:model-value="tabsValue"
    :user-info="userStore.userInfo"
    :tabs="tabs"
  >
    <template #content>
      <ProfileBase v-if="tabsValue === 'basic'" />
      <ProfileOtpSetting v-if="tabsValue === 'otp'" />
      <ProfilePasswordSetting v-if="tabsValue === 'password'" />
    </template>
  </Profile>
</template>
