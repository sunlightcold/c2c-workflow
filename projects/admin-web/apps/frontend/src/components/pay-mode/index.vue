<script setup lang="ts">
import type { PayModeItem, PayModeProps } from './type';

import { computed } from 'vue';

const props = withDefaults(defineProps<PayModeProps>(), {});

const modelValue = defineModel<PayModeItem[]>({ default: [] });

function addPayMode() {
  modelValue.value.push({ payMode: '', payCode: '' });
}

function removePayMode(index: number) {
  modelValue.value.splice(index, 1);
}

const getAvailableOptions = computed(() => {
  return (currentIndex: number) => {
    const usedValues = new Set(
      modelValue.value
        .map((item, index) => (index === currentIndex ? null : item.payMode))
        .filter(Boolean),
    );
    return (
      props.options?.filter((option) => !usedValues.has(option.value)) || []
    );
  };
});
</script>

<template>
  <div class="flex w-full flex-col gap-4">
    <div
      class="flex w-full items-center gap-2"
      v-for="(item, index) in modelValue"
      :key="item.payMode"
    >
      <AFormItemRest>
        <ASelect v-model:value="item.payMode">
          <ASelectOption
            v-for="option in getAvailableOptions(index)"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </ASelectOption>
        </ASelect>
      </AFormItemRest>
      <AFormItemRest>
        <AInput v-model:value="item.payCode" />
      </AFormItemRest>
      <DeleteOutlined
        class="cursor-pointer text-red-400"
        @click="removePayMode(index)"
      />
    </div>
    <AButton class="w-full" :disabled="disabled" @click="addPayMode">
      <PlusOutlined />{{ addBtnText ?? '' }}
    </AButton>
  </div>
</template>
