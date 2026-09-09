<script setup lang="ts">
import type { GraphicCaptcheProps } from './type';

import { Image, Input } from 'ant-design-vue';

withDefaults(defineProps<GraphicCaptcheProps>(), {});

const emit = defineEmits<{
  graphicClick: [];
}>();

const modelValue = defineModel<string>({ default: '' });

function graphicClick() {
  emit('graphicClick');
}
</script>

<template>
  <div class="flex w-full items-center gap-2">
    <Input class="flex-1" v-bind="inputProps" v-model:value="modelValue" />
    <Image
      class="rounded-sm border"
      v-bind="imgProps"
      :class="inputProps.disabled ? 'cursor-not-allowed' : 'cursor-pointer'"
      @click="inputProps.disabled || graphicClick()"
    />
  </div>
</template>
