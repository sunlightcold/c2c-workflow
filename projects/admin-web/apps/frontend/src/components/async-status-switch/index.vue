<script setup lang="ts">
import { ref } from 'vue';

import { Switch as ASwitch } from 'ant-design-vue';

const props = withDefaults(
  defineProps<{
    checked: boolean;
    checkedLabel?: string;
    disabled?: boolean;
    label: string;
    request: (checked: boolean) => Promise<unknown> | unknown;
    uncheckedLabel?: string;
  }>(),
  {
    checkedLabel: '启用',
    disabled: false,
    uncheckedLabel: '停用',
  },
);

const loading = ref(false);

async function change(checked: unknown) {
  const nextChecked = checked === true;
  if (loading.value || props.disabled || nextChecked === props.checked) return;
  loading.value = true;
  try {
    await props.request(nextChecked);
  } catch {
    // The request layer displays the error; the controlled value stays unchanged.
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ASwitch
    :aria-label="label"
    :checked="checked"
    :checked-children="checkedLabel"
    :disabled="disabled"
    :loading="loading"
    :unchecked-children="uncheckedLabel"
    @change="change"
  />
</template>
