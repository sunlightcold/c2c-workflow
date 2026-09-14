<script lang="ts" setup>
import { computed } from 'vue';

import { formatBusinessTime } from './business-ui';

const props = defineProps<{
  createdAt?: null | string;
  endedAt?: null | string;
}>();

const createdText = computed(() => formatBusinessTime(props.createdAt));
const endedText = computed(() => formatBusinessTime(props.endedAt));
</script>

<template>
  <div
    class="grid min-h-[52px] grid-cols-[40px_minmax(0,1fr)] content-center items-center gap-x-2 gap-y-1 text-left"
    data-testid="order-time-cell"
  >
    <ATag class="m-0 w-10 px-1 text-center" color="blue">创建</ATag>
    <time
      v-if="createdAt"
      class="whitespace-nowrap tabular-nums"
      :datetime="createdAt"
    >
      {{ createdText }}
    </time>
    <span v-else class="text-muted-foreground">-</span>

    <ATag class="m-0 w-10 px-1 text-center" color="orange">结束</ATag>
    <time
      v-if="endedAt"
      class="whitespace-nowrap tabular-nums"
      :datetime="endedAt"
    >
      {{ endedText }}
    </time>
    <span v-else class="text-muted-foreground">-</span>
  </div>
</template>
