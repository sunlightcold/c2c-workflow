<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';

import type { BusinessApi } from '#/api';

import { computed, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createPaymentAccountApi,
  getPaymentAccountsApi,
  getPaymentPlatformsApi,
  openPaymentAccountChannelApi,
} from '#/api';
import { runResourceAction } from '#/hooks';

import {
  businessStatusColor,
  businessStatusText,
  formatBusinessTime,
  validateBusinessForm,
} from '../shared/business-ui';
import BusinessScopeSelect from '../shared/BusinessScopeSelect.vue';

const tenantId = ref('');
const items = ref<BusinessApi.PaymentAccount[]>([]);
const platforms = ref<BusinessApi.PaymentPlatform[]>([]);
const loading = ref(false);
const createOpen = ref(false);
const channelOpen = ref(false);
const selectedAccount = ref<BusinessApi.PaymentAccount>();
const createFormRef = ref<FormInstance>();
const channelFormRef = ref<FormInstance>();
const createForm = reactive({
  code: '',
  credentialRef: '',
  externalAccountId: '',
  name: '',
  platformId: '',
});
const channelForm = reactive({ channelId: '', configRef: '' });

const platformOptions = computed(() =>
  platforms.value
    .filter(({ status }) => status === 'active')
    .map((platform) => ({ label: platform.name, value: platform.id })),
);
const availableChannels = computed(() => {
  const platform = platforms.value.find(
    ({ id }) => id === selectedAccount.value?.platformId,
  );
  const opened = new Set(
    selectedAccount.value?.channels.map(({ channelId }) => channelId),
  );
  return (platform?.channels ?? [])
    .filter(({ id, status }) => status === 'active' && !opened.has(id))
    .map((channel) => ({
      label: `${channel.name} · ${channel.executionMode === 'BATCH' ? '批量有密' : '商家转账'}`,
      value: channel.id,
    }));
});

async function onScopeReady() {
  platforms.value = await getPaymentPlatformsApi();
  await refresh();
}

async function refresh() {
  if (!tenantId.value) return;
  loading.value = true;
  try {
    items.value = await getPaymentAccountsApi({ tenantId: tenantId.value });
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(createForm, {
    code: '',
    credentialRef: '',
    externalAccountId: '',
    name: '',
    platformId: platforms.value[0]?.id ?? '',
  });
  createOpen.value = true;
}

async function submitAccount() {
  if (!(await validateBusinessForm(createFormRef.value))) return;
  await runResourceAction({
    action: () =>
      createPaymentAccountApi({ ...createForm, tenantId: tenantId.value }),
    onSuccess: async () => {
      createOpen.value = false;
      await refresh();
    },
    successMessage: '支付账号已创建',
  });
}

function openChannel(account: BusinessApi.PaymentAccount) {
  selectedAccount.value = account;
  Object.assign(channelForm, { channelId: '', configRef: '' });
  channelOpen.value = true;
}

async function submitChannel() {
  const account = selectedAccount.value;
  if (!account) return;
  if (!(await validateBusinessForm(channelFormRef.value))) return;
  await runResourceAction({
    action: () =>
      openPaymentAccountChannelApi(account.id, {
        channelId: channelForm.channelId,
        configRef: channelForm.configRef || undefined,
        tenantId: tenantId.value,
      }),
    onSuccess: async () => {
      channelOpen.value = false;
      await refresh();
    },
    successMessage: '支付通道已开通',
  });
}

function platformName(id: string) {
  return platforms.value.find((platform) => platform.id === id)?.name ?? id;
}
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <BusinessScopeSelect v-model="tenantId" @ready="onScopeReady" />
      <AButton
        v-access:code="['payment:account:create']"
        :disabled="!tenantId || platforms.length === 0"
        type="primary"
        @click="openCreate"
      >
        新增支付账号
      </AButton>
    </div>
    <ATable
      :data-source="items"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 1100 }"
    >
      <ATableColumn data-index="name" title="账号名称" :width="190" />
      <ATableColumn data-index="code" title="账号编码" :width="150" />
      <ATableColumn key="platform" title="支付平台" :width="120">
        <template #default="{ record }">
          {{ platformName(record.platformId) }}
        </template>
      </ATableColumn>
      <ATableColumn
        data-index="externalAccountId"
        title="商户号"
        :width="180"
      />
      <ATableColumn key="credential" title="凭据" :width="100">
        <template #default="{ record }">
          <ATag :color="record.credentialConfigured ? 'success' : 'warning'">
            {{ record.credentialConfigured ? '已配置' : '未配置' }}
          </ATag>
        </template>
      </ATableColumn>
      <ATableColumn key="channels" title="已开通通道" :width="280">
        <template #default="{ record }">
          <ASpace wrap>
            <ATag v-for="channel in record.channels" :key="channel.id">
              {{ channel.channelName || channel.channelCode }}
            </ATag>
            <span
              v-if="record.channels.length === 0"
              class="text-muted-foreground"
            >
              未开通
            </span>
          </ASpace>
        </template>
      </ATableColumn>
      <ATableColumn key="status" title="状态" :width="100">
        <template #default="{ record }">
          <ATag :color="businessStatusColor(record.status)">
            {{ businessStatusText(record.status) }}
          </ATag>
        </template>
      </ATableColumn>
      <ATableColumn key="createdAt" title="创建时间" :width="190">
        <template #default="{ record }">
          {{ formatBusinessTime(record.createdAt) }}
        </template>
      </ATableColumn>
      <ATableColumn key="action" fixed="right" title="操作" :width="110">
        <template #default="{ record }">
          <AButton
            v-access:code="['payment:account:bind']"
            :disabled="record.status !== 'active'"
            size="small"
            type="link"
            @click="openChannel(record)"
          >
            开通通道
          </AButton>
        </template>
      </ATableColumn>
    </ATable>

    <AModal v-model:open="createOpen" title="新增支付账号" @ok="submitAccount">
      <AAlert
        class="mb-4"
        message="支付凭据只保存 Secret 引用，提交后不会显示原值"
        show-icon
        type="info"
      />
      <AForm ref="createFormRef" :model="createForm" layout="vertical">
        <AFormItem
          label="账号名称"
          name="name"
          :rules="[{ required: true, message: '请输入账号名称' }]"
        >
          <AInput v-model:value="createForm.name" />
        </AFormItem>
        <AFormItem
          label="账号编码"
          name="code"
          :rules="[{ required: true, message: '请输入账号编码' }]"
        >
          <AInput v-model:value="createForm.code" />
        </AFormItem>
        <AFormItem
          label="支付平台"
          name="platformId"
          :rules="[{ required: true, message: '请选择支付平台' }]"
        >
          <ASelect
            v-model:value="createForm.platformId"
            :options="platformOptions"
          />
        </AFormItem>
        <AFormItem
          label="支付宝商户号"
          name="externalAccountId"
          :rules="[{ required: true, message: '请输入支付宝商户号' }]"
        >
          <AInput v-model:value="createForm.externalAccountId" />
        </AFormItem>
        <AFormItem
          label="Secret 引用"
          name="credentialRef"
          :rules="[{ required: true, message: '请输入 Secret 引用' }]"
        >
          <AInputPassword
            v-model:value="createForm.credentialRef"
            autocomplete="new-password"
          />
        </AFormItem>
      </AForm>
    </AModal>

    <AModal v-model:open="channelOpen" title="开通支付通道" @ok="submitChannel">
      <AForm ref="channelFormRef" :model="channelForm" layout="vertical">
        <AFormItem label="支付账号">{{ selectedAccount?.name }}</AFormItem>
        <AFormItem
          label="支付通道"
          name="channelId"
          :rules="[{ required: true, message: '请选择支付通道' }]"
        >
          <ASelect
            v-model:value="channelForm.channelId"
            :options="availableChannels"
            placeholder="选择该账号平台下的支付通道"
          />
        </AFormItem>
        <AFormItem label="通道配置引用">
          <AInputPassword
            v-model:value="channelForm.configRef"
            autocomplete="new-password"
            placeholder="没有独立配置时可留空"
          />
        </AFormItem>
      </AForm>
    </AModal>
  </Page>
</template>
