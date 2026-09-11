<script setup lang="ts">
import { ref } from 'vue';

import { UploadOutlined } from '@ant-design/icons-vue';
import { Button as AButton, Input, message } from 'ant-design-vue';

withDefaults(
  defineProps<{
    accept?: string;
    ariaLabel?: string;
    fileButtonLabel: string;
    modelValue?: string;
    placeholder?: string;
    rows?: number;
  }>(),
  {
    accept: '.pem,.key,.crt,.cer,.txt',
    ariaLabel: undefined,
    modelValue: '',
    placeholder: '可直接粘贴内容，或读取本地文件',
    rows: 3,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const ATextarea = Input.TextArea;
const fileInput = ref<HTMLInputElement>();

async function readFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    emit('update:modelValue', await file.text());
  } catch {
    message.error('文件读取失败，请重新选择或直接粘贴内容');
  } finally {
    input.value = '';
  }
}
</script>

<template>
  <div class="min-w-0">
    <ATextarea
      :aria-label="ariaLabel"
      :auto-size="{ minRows: rows, maxRows: 6 }"
      :placeholder="placeholder"
      :value="modelValue"
      @update:value="emit('update:modelValue', $event)"
    />
    <div class="mt-2">
      <AButton html-type="button" size="small" @click="fileInput?.click()">
        <template #icon><UploadOutlined /></template>
        {{ fileButtonLabel }}
      </AButton>
      <input
        ref="fileInput"
        :accept="accept"
        :aria-label="fileButtonLabel"
        class="sr-only"
        type="file"
        @change="readFile"
      />
    </div>
  </div>
</template>
