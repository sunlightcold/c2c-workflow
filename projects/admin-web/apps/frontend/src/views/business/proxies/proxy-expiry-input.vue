<script setup lang="ts">
import { computed } from 'vue';

import dayjs from 'dayjs';

const props = defineProps<{ baseDate?: string; disabled?: boolean }>();
const value = defineModel<null | string>('value');
const date = computed({
  get: () => value.value || undefined,
  set: (date: string | undefined) => {
    value.value = date || null;
  },
});
const base = computed(() => dayjs(props.baseDate).startOf('day'));
const days = computed({
  get: () =>
    value.value ? dayjs(value.value).diff(base.value, 'day') : undefined,
  set: (days: null | number | undefined) => {
    value.value =
      days && days > 0
        ? base.value.add(days, 'day').format('YYYY-MM-DD')
        : null;
  },
});
</script>

<template>
  <div class="w-full space-y-3">
    <ASpace :size="8" wrap>
      <AButton
        v-for="preset in [7, 30, 90, 180]"
        :key="preset"
        :disabled="disabled"
        size="small"
        @click="days = preset"
      >
        {{ preset }} 天
      </AButton>
      <AButton :disabled="disabled" size="small" @click="value = null">
        永不过期
      </AButton>
    </ASpace>
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <AInputNumber
        v-model:value="days"
        :disabled="disabled"
        :min="0"
        :precision="0"
        class="w-full"
        placeholder="有效天数"
        aria-label="有效天数"
      />
      <ADatePicker
        v-model:value="date"
        :disabled="disabled"
        class="w-full"
        value-format="YYYY-MM-DD"
        placeholder="请选择到期日期"
        aria-label="到期日期"
      />
    </div>
  </div>
</template>
