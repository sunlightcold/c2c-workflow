<script setup lang="ts">
import type { VbenFormSchema } from '#/adapter/form';

import { computed, onMounted, ref } from 'vue';

import { ProfileBaseSetting, z } from '@vben/common-ui';
import { $t } from '@vben/locales';
import { useUserStore } from '@vben/stores';

import { message } from 'ant-design-vue';

import { getUserInfoApi, updateAccountApi, updateAvatarApi } from '#/api';

const userStore = useUserStore();

type BaseInfoFormValues = {
  avatar?: Array<{ url?: string }>;
  nickname?: string;
};

const loading = ref(false);
const profileBaseSettingRef = ref();

const formSchema = computed((): VbenFormSchema[] => {
  return [
    {
      component: 'Upload',
      componentProps: {
        accept: 'image/*',
        customRequest: async (options: any) => {
          try {
            const { avatar } = await updateAvatarApi(options.file);
            options.onSuccess({}, options.file);
            userStore.setUserInfo({ ...userStore.userInfo!, avatar });
            message.success($t('authentication.profileAvatarUpdateSuccess'));
          } catch (error) {
            options.onError(error);
          }
        },
        listType: 'picture-card',
        maxCount: 1,
        name: 'avatar',
        showUploadList: true,
      },
      fieldName: 'avatar',
      label: $t('authentication.profileAvatar'),
    },
    {
      component: 'Input',
      componentProps: {
        maxlength: 32,
        placeholder: $t('authentication.profileNicknamePlaceholder'),
        showCount: true,
      },
      fieldName: 'nickname',
      label: $t('authentication.profileNickname'),
      rules: z.string().min(1, {
        message: $t('authentication.profileNicknameRequired'),
      }),
    },
  ];
});

onMounted(loadUserInfo);

async function loadUserInfo() {
  loading.value = true;
  try {
    const data = await getUserInfoApi();
    userStore.setUserInfo(data);
    profileBaseSettingRef.value?.getFormApi().setValues({
      avatar: data.avatar ? [{ url: data.avatar }] : [],
      nickname: data.nickname,
    });
  } finally {
    loading.value = false;
  }
}

async function handleSubmit(params: BaseInfoFormValues) {
  const nickname = params.nickname?.trim();
  if (!nickname) {
    throw new Error($t('authentication.profileNicknameEmpty'));
  }

  loading.value = true;
  try {
    await updateAccountApi({ nickname });
    userStore.setUserInfo({ ...userStore.userInfo!, nickname });
    message.success($t('authentication.profileUpdateSuccess'));
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ProfileBaseSetting
    ref="profileBaseSettingRef"
    :form-schema="formSchema"
    :loading="loading"
    @submit="handleSubmit"
  />
</template>
