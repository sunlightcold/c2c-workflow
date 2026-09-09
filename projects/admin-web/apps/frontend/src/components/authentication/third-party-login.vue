<script setup lang="ts">
import { $t } from '@vben/locales';

import {
  GithubOutlined,
  GoogleOutlined,
  QqOutlined,
  WechatOutlined,
} from '@ant-design/icons-vue';
import { Button } from 'ant-design-vue';

defineOptions({
  name: 'ThirdPartyLogin',
});
</script>

<template>
  <div class="w-full sm:mx-auto md:max-w-md">
    <div class="mt-4 flex items-center justify-between">
      <span class="border-input w-[35%] border-b dark:border-gray-600"></span>
      <span class="text-muted-foreground text-center text-xs uppercase">
        {{ $t('authentication.thirdPartyLogin') }}
      </span>
      <span class="border-input w-[35%] border-b dark:border-gray-600"></span>
    </div>

    <div class="mt-4 flex flex-wrap justify-center">
      <Button type="text" shape="circle" class="mb-3">
        <template #icon>
          <WechatOutlined />
        </template>
      </Button>
      <Button type="text" shape="circle" class="mb-3">
        <template #icon>
          <QqOutlined />
        </template>
      </Button>
      <Button type="text" shape="circle" class="mb-3">
        <template #icon>
          <GithubOutlined />
        </template>
      </Button>
      <Button type="text" shape="circle" class="mb-3">
        <template #icon>
          <GoogleOutlined />
        </template>
      </Button>
    </div>
  </div>
</template>
