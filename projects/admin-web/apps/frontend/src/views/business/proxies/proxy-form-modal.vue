<script setup lang="ts">
import type { IpProxy, ProxyInput } from '#/api/business/proxies';

import { computed, nextTick, ref, watch } from 'vue';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  allProxies,
  batchCreateProxies,
  createProxy,
  updateProxy,
} from '#/api/business/proxies';
import { BaseModal } from '#/components/base-modal';
import { runResourceAction } from '#/hooks';

import { businessModalProps } from '../shared/business-form-layout';
import ProxyExpiryInput from './proxy-expiry-input.vue';
import { parseProxyBatch, proxyAddress } from './proxy-format';
import { proxyFormSchema } from './schema';

const props = defineProps<{
  open: boolean;
  proxy?: IpProxy;
  tenantId: string;
}>();
const emit = defineEmits<{ close: []; saved: [] }>();
const visible = computed({
  get: () => props.open,
  set: (open) => {
    if (!open) emit('close');
  },
});
const mode = ref('standard');
const batchInput = ref('');
const submitting = ref(false);
const backupsLoading = ref(false);
const parsed = computed(() => parseProxyBatch(batchInput.value));

type FormValues = ProxyInput & { date?: null | string };
const [Form, formApi] = useVbenForm({
  commonConfig: { componentProps: { class: 'w-full' } },
  layout: 'vertical',
  schema: proxyFormSchema(false),
  showDefaultActions: false,
  wrapperClass: 'grid-cols-1 gap-x-4 md:grid-cols-2',
});

watch(
  () => props.open,
  async (open) => {
    if (!open) return;
    mode.value = 'standard';
    batchInput.value = '';
    const value = props.proxy;
    formApi.setState({ schema: proxyFormSchema(Boolean(value)) });
    await nextTick();
    await formApi.resetForm();
    await formApi.setValues({
      name: value?.name ?? '',
      protocol: value?.protocol ?? 'http',
      host: value?.host ?? '',
      port: value?.port ?? 8080,
      username: value?.username ?? '',
      password: '',
      status: value?.status === 'expired' ? undefined : value?.status,
      date: value?.expires_at
        ? new Date(value.expires_at * 1000).toISOString().slice(0, 10)
        : null,
      expiry_warn_days: value?.expiry_warn_days ?? 7,
      fallback_mode: value?.fallback_mode ?? 'none',
      backup_proxy_id: value?.backup_proxy_id ?? null,
    });
    if (!props.tenantId) return;
    const tenantId = props.tenantId;
    backupsLoading.value = true;
    try {
      const options = await allProxies(tenantId);
      if (
        !props.open ||
        props.tenantId !== tenantId ||
        props.proxy?.id !== value?.id
      )
        return;
      formApi.updateSchema([
        {
          fieldName: 'backup_proxy_id',
          componentProps: {
            options: options
              .filter((p) => p.id !== value?.id)
              .map((p) => ({
                label: `${p.name} (${proxyAddress(p)})`,
                value: p.id,
              })),
          },
        },
      ]);
    } finally {
      backupsLoading.value = false;
    }
  },
);

async function save() {
  if (submitting.value || !props.tenantId) return;
  const isBatch = mode.value === 'batch' && !props.proxy;
  if (isBatch && !parsed.value.valid) return;
  submitting.value = true;
  try {
    if (!isBatch) {
      const result = await formApi.validate();
      if (!result.valid) return;
    }
    formApi.setState({ commonConfig: { disabled: true } });
    if (isBatch) {
      await runResourceAction({
        action: async () => {
          const result = await batchCreateProxies(
            props.tenantId,
            parsed.value.proxies,
          );
          message.success(
            `已创建 ${result.created} 个代理，跳过 ${result.skipped} 个已存在代理`,
          );
        },
        onSuccess: () => {
          emit('saved');
          emit('close');
        },
      });
    } else {
      const form = await formApi.getValues<FormValues>();
      const input: ProxyInput = {
        name: form.name,
        protocol: form.protocol,
        host: form.host,
        port: form.port,
        username: form.username,
        // Preserve sub2api's UTC parsing of YYYY-MM-DD before converting to seconds.
        expires_at: form.date
          ? Math.floor(new Date(form.date).getTime() / 1000)
          : null,
        expiry_warn_days: form.expiry_warn_days,
        fallback_mode: form.fallback_mode,
        backup_proxy_id:
          form.fallback_mode === 'proxy' ? form.backup_proxy_id : null,
        ...(props.proxy && form.status ? { status: form.status } : {}),
        ...(!props.proxy || form.password ? { password: form.password } : {}),
      };
      await runResourceAction({
        action: () =>
          props.proxy
            ? updateProxy(props.tenantId, props.proxy.id, input)
            : createProxy(props.tenantId, input),
        onSuccess: () => {
          emit('saved');
          emit('close');
        },
        successMessage: props.proxy ? '代理已更新' : '代理已创建',
      });
    }
  } finally {
    submitting.value = false;
    formApi.setState({ commonConfig: { disabled: false } });
  }
}
</script>

<template>
  <BaseModal
    v-model="visible"
    v-bind="businessModalProps(proxy ? '编辑代理' : '添加代理')"
    :confirm-loading="submitting"
    :closable="!submitting"
    :keyboard="!submitting"
    :cancel-button-props="{ disabled: submitting }"
    :ok-button-props="{ disabled: mode === 'batch' && !parsed.valid }"
    :ok-text="mode === 'batch' ? `添加 ${parsed.valid} 个代理` : '保存'"
    @ok="save"
  >
    <ATabs v-if="!proxy" v-model:active-key="mode">
      <ATabPane key="standard" tab="标准添加" :disabled="submitting" />
      <ATabPane key="batch" tab="批量添加" :disabled="submitting" />
    </ATabs>
    <div v-show="mode === 'batch' && !proxy" class="space-y-4">
      <AForm layout="vertical">
        <AFormItem
          label="代理列表（每行一个）"
          html-for="proxy-batch-input"
          class="mb-0"
        >
          <ATextarea
            id="proxy-batch-input"
            v-model:value="batchInput"
            :disabled="submitting"
            :rows="10"
            placeholder="http://host:port&#10;http://username:password@host:port&#10;https://host:port&#10;socks5://username:password@host:port&#10;socks5h://[::1]:1080"
            autocomplete="off"
          />
        </AFormItem>
      </AForm>
      <AAlert
        type="info"
        show-icon
        message="支持 HTTP、HTTPS、SOCKS5、SOCKS5H。无效和重复行会跳过，其余有效代理仍可添加。"
      />
      <ASpace :size="16" wrap role="status">
        <span>总计 {{ parsed.total }}</span>
        <span>有效 {{ parsed.valid }}</span>
        <span>无效 {{ parsed.invalid }}</span>
        <span>重复 {{ parsed.duplicate }}</span>
      </ASpace>
    </div>
    <div v-show="mode === 'standard' || proxy">
      <Form>
        <template #date="slotProps">
          <ProxyExpiryInput
            v-bind="slotProps"
            :base-date="proxy?.created_at.slice(0, 10)"
            :disabled="submitting"
          />
        </template>
        <template #backup_proxy_id="slotProps">
          <ASelect v-bind="slotProps" :loading="backupsLoading" />
        </template>
      </Form>
    </div>
  </BaseModal>
</template>
