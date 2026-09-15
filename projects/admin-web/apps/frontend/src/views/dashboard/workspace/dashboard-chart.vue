<script lang="ts" setup>
import type { EchartsUIType, ECOption } from '@vben/plugins/echarts';

import { onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = withDefaults(
  defineProps<{
    description: string;
    height?: string;
    options: ECOption;
  }>(),
  { height: '300px' },
);

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

function render() {
  void renderEcharts(props.options);
}

onMounted(render);
watch(() => props.options, render, { deep: true });
</script>

<template>
  <div :aria-label="description" role="img">
    <EchartsUI ref="chartRef" :height="height" />
  </div>
</template>
