<script setup lang="ts">
import type { IpProxy } from '#/api/business/proxies';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { testProxy } from '#/api/business/proxies';

import { BUSINESS_NESTED_MODAL_Z_INDEX } from '../shared/business-form-layout';
import { proxyAddress } from './proxy-format';

const props = defineProps<{
  disabled?: boolean;
  label?: string;
  modelValue: null | string;
  options: IpProxy[];
  optionsLoading?: boolean;
  saving?: boolean;
  size?: 'large' | 'middle' | 'small';
  tenantId: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: null | string] }>();
const batchTesting = ref(false);
const testing = ref(new Set<string>());
const open = ref(false);
const keyword = ref('');
const filtered = computed(() =>
  props.options.filter((p) =>
    `${p.name} ${p.host}`.toLowerCase().includes(keyword.value.toLowerCase()),
  ),
);
const selected = computed(() =>
  props.options.find((p) => p.id === props.modelValue),
);
function getPopupContainer() {
  return window.document.body;
}
watch(
  () => props.tenantId,
  () => {
    keyword.value = '';
    open.value = false;
  },
  { immediate: true },
);
function select(value: null | string) {
  if (props.disabled || props.optionsLoading || props.saving) return;
  emit('update:modelValue', value);
  open.value = false;
}
async function test(proxy: IpProxy) {
  if (testing.value.has(proxy.id)) return;
  testing.value.add(proxy.id);
  try {
    proxy.last_test = await testProxy(props.tenantId, proxy.id);
  } finally {
    testing.value.delete(proxy.id);
  }
}
async function testAll() {
  if (batchTesting.value) return;
  batchTesting.value = true;
  const queue = [...filtered.value];
  try {
    await Promise.all(
      Array.from({ length: Math.min(5, queue.length) }, async () => {
        for (let item = queue.shift(); item; item = queue.shift()) {
          try {
            await test(item);
          } catch {
            /* Request client displays errors. */
          }
        }
      }),
    );
  } finally {
    batchTesting.value = false;
  }
}
</script>

<template>
  <APopover
    v-model:open="open"
    :trigger="disabled ? [] : 'click'"
    placement="bottomLeft"
    :get-popup-container="getPopupContainer"
    :z-index="BUSINESS_NESTED_MODAL_Z_INDEX"
  >
    <template #content>
      <div class="w-80 max-w-[80vw] space-y-3">
        <div class="flex gap-2">
          <AInput
            v-model:value="keyword"
            placeholder="搜索名称或地址"
            aria-label="搜索代理"
          />
          <AButton
            v-access:code="['system:proxy:test']"
            :disabled="optionsLoading || filtered.length === 0"
            :loading="batchTesting"
            @click="testAll"
          >
            批量测试
          </AButton>
        </div>
        <ASpin :spinning="optionsLoading">
          <div
            class="max-h-72 overflow-auto"
            role="listbox"
            aria-label="代理列表"
          >
            <AButton
              block
              type="text"
              class="text-left"
              role="option"
              :aria-selected="!modelValue"
              @click="select(null)"
            >
              <span
                class="w-full items-center justify-between gap-2"
                :style="{ display: 'flex' }"
              >
                <span>无代理（直连）</span>
                <IconifyIcon
                  v-if="!modelValue"
                  icon="lucide:check"
                  class="text-primary size-4 shrink-0"
                  aria-hidden="true"
                />
              </span>
            </AButton>
            <div
              v-for="proxy in filtered"
              :key="proxy.id"
              class="flex items-center gap-2 border-t py-2"
            >
              <AButton
                type="text"
                class="h-auto min-w-0 flex-1 whitespace-normal px-2 text-left"
                role="option"
                :aria-selected="modelValue === proxy.id"
                @click="select(proxy.id)"
              >
                <div class="flex items-center gap-2">
                  <span class="min-w-0 flex-1 truncate" :title="proxy.name">{{
                    proxy.name
                  }}</span>
                  <ATag class="mr-0">{{ proxy.account_count }}</ATag>
                  <IconifyIcon
                    v-if="modelValue === proxy.id"
                    icon="lucide:check"
                    class="text-primary size-4"
                    aria-hidden="true"
                  />
                </div>
                <div class="text-muted-foreground break-all text-xs">
                  {{ proxy.protocol }}://{{ proxyAddress(proxy) }}
                </div>
                <div v-if="proxy.last_test">
                  <div class="text-muted-foreground text-xs">
                    {{ proxy.last_test.country }}
                    {{
                      proxy.last_test.success
                        ? `${proxy.last_test.latency_ms} ms`
                        : '连接失败'
                    }}
                  </div>
                </div>
              </AButton>
              <AButton
                v-access:code="['system:proxy:test']"
                size="small"
                :loading="testing.has(proxy.id)"
                @click.stop="test(proxy)"
              >
                测试
              </AButton>
            </div>
            <AEmpty
              v-if="!optionsLoading && filtered.length === 0"
              description="暂无可用代理"
              :image="undefined"
            />
          </div>
        </ASpin>
      </div>
    </template>
    <AButton
      block
      :disabled="disabled || optionsLoading || saving"
      :loading="optionsLoading || saving"
      :size="size"
      class="text-left"
      :style="{ display: 'inline-flex', alignItems: 'center' }"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
    >
      <span
        class="min-w-0 flex-1 items-center justify-between gap-2"
        :style="{ display: 'flex' }"
      >
        <span class="min-w-0 flex-1 truncate text-left">{{
          selected?.name ||
          (modelValue ? '绑定代理已停用或到期，请重新选择' : '无代理（直连）')
        }}</span>
        <IconifyIcon
          icon="lucide:chevrons-up-down"
          class="text-muted-foreground size-4 shrink-0"
          aria-hidden="true"
        />
      </span>
    </AButton>
  </APopover>
</template>
