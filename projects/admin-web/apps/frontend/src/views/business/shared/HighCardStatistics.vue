<script lang="ts" setup>
import type { HighCardStatisticItem } from './high-card-statistics';

import { Tag } from 'ant-design-vue';

defineOptions({ name: 'HighCardStatistics' });

defineProps<{ items: HighCardStatisticItem[] }>();
</script>

<template>
  <div class="flex flex-nowrap gap-2 overflow-x-auto">
    <div
      v-for="item in items"
      :key="item.title"
      class="flex min-h-[84px] min-w-[220px] flex-1 flex-col justify-center rounded-sm p-2 text-white"
      :class="item.cardClass"
    >
      <div class="text-center text-sm">{{ item.title }}</div>
      <div class="text-center text-xl font-medium tabular-nums">
        {{ item.value }}{{ item.suffix }}
      </div>
      <div class="flex min-h-6 justify-center gap-2">
        <Tag v-for="tag in item.subTag" :key="tag.label" :color="tag.color">
          {{ tag.label }}{{ tag.value }}{{ tag.suffix }}
        </Tag>
      </div>
    </div>
  </div>
</template>
