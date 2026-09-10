<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';

import type { BusinessApi } from '#/api';

import { computed, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createMerchantApi,
  createPaymentPlanApi,
  getMerchantCredentialsApi,
  getMerchantsApi,
  getPaymentAccountsApi,
  getPaymentPlansApi,
  rotateMerchantCredentialApi,
} from '#/api';
import { runResourceAction } from '#/hooks';

import {
  businessStatusColor,
  businessStatusText,
  formatBusinessTime,
  merchantPlatformOptions,
  merchantPlatformText,
  validateBusinessForm,
} from '../shared/business-ui';
import BusinessScopeSelect from '../shared/BusinessScopeSelect.vue';

const tenantId = ref('');
const items = ref<BusinessApi.Merchant[]>([]);
const loading = ref(false);
const createOpen = ref(false);
const configOpen = ref(false);
const credentialOpen = ref(false);
const planOpen = ref(false);
const createFormRef = ref<FormInstance>();
const credentialFormRef = ref<FormInstance>();
const planFormRef = ref<FormInstance>();
const selectedMerchant = ref<BusinessApi.Merchant>();
const credentials = ref<BusinessApi.MerchantCredential[]>([]);
const accounts = ref<BusinessApi.PaymentAccount[]>([]);
const plans = ref<BusinessApi.PaymentPlan[]>([]);
const createForm = reactive({
  code: '',
  externalMerchantId: '',
  name: '',
  platform: 'BINANCE' as BusinessApi.MerchantPlatform,
});
const credentialForm = reactive({
  clientType: 'WEB',
  credentialRef: '',
  requestTimeoutMs: 10_000,
  xUserId: '',
});
const planForm = reactive({
  currency: 'CNY',
  paymentAccountChannelId: '',
  paymentAccountId: '',
  priority: 100,
  scene: 'C2C_BUY',
  weight: 100,
});

const selectedAccount = computed(() =>
  accounts.value.find(({ id }) => id === planForm.paymentAccountId),
);
const accountOptions = computed(() =>
  accounts.value
    .filter(({ status }) => status === 'active')
    .map((account) => ({ label: account.name, value: account.id })),
);
const channelOptions = computed(() =>
  (selectedAccount.value?.channels ?? [])
    .filter(({ status }) => status === 'active')
    .map((channel) => ({
      label: `${channel.channelName ?? channel.channelCode} · ${channel.executionMode === 'BATCH' ? '批量有密' : '商家转账'}`,
      value: channel.id,
    })),
);

async function refresh() {
  if (!tenantId.value) return;
  loading.value = true;
  try {
    items.value = await getMerchantsApi({ tenantId: tenantId.value });
  } finally {
    loading.value = false;
  }
}

async function submitMerchant() {
  if (!(await validateBusinessForm(createFormRef.value))) return;
  await runResourceAction({
    action: () =>
      createMerchantApi({
        ...createForm,
        externalMerchantId: createForm.externalMerchantId || undefined,
        tenantId: tenantId.value,
      }),
    onSuccess: async () => {
      createOpen.value = false;
      Object.assign(createForm, {
        code: '',
        externalMerchantId: '',
        name: '',
        platform: 'BINANCE',
      });
      await refresh();
    },
    successMessage: '商家已创建',
  });
}

async function openConfig(merchant: BusinessApi.Merchant) {
  selectedMerchant.value = merchant;
  configOpen.value = true;
  [credentials.value, accounts.value, plans.value] = await Promise.all([
    getMerchantCredentialsApi(merchant.id, { tenantId: tenantId.value }),
    getPaymentAccountsApi({ tenantId: tenantId.value }),
    getPaymentPlansApi({ merchantId: merchant.id, tenantId: tenantId.value }),
  ]);
}

function openCredential() {
  Object.assign(credentialForm, {
    clientType: 'WEB',
    credentialRef: '',
    requestTimeoutMs: 10_000,
    xUserId: '',
  });
  credentialOpen.value = true;
}

async function submitCredential() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  if (!(await validateBusinessForm(credentialFormRef.value))) return;
  await runResourceAction({
    action: () =>
      rotateMerchantCredentialApi(merchant.id, {
        ...(merchant.platform === 'BINANCE'
          ? {
              clientType: credentialForm.clientType,
              xUserId: credentialForm.xUserId || undefined,
            }
          : {}),
        credentialRef: credentialForm.credentialRef,
        requestTimeoutMs: credentialForm.requestTimeoutMs,
        tenantId: tenantId.value,
      }),
    onSuccess: async () => {
      credentialOpen.value = false;
      credentials.value = await getMerchantCredentialsApi(merchant.id, {
        tenantId: tenantId.value,
      });
    },
    successMessage: '平台凭据已更新',
  });
}

function openPlan() {
  Object.assign(planForm, {
    currency: 'CNY',
    paymentAccountChannelId: '',
    paymentAccountId: '',
    priority: 100,
    scene: 'C2C_BUY',
    weight: 100,
  });
  planOpen.value = true;
}

function onAccountChange() {
  planForm.paymentAccountChannelId = '';
}

async function submitPlan() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  if (!(await validateBusinessForm(planFormRef.value))) return;
  await runResourceAction({
    action: () =>
      createPaymentPlanApi({
        ...planForm,
        merchantId: merchant.id,
        tenantId: tenantId.value,
      }),
    onSuccess: async () => {
      planOpen.value = false;
      plans.value = await getPaymentPlansApi({
        merchantId: merchant.id,
        tenantId: tenantId.value,
      });
    },
    successMessage: '支付方案已创建',
  });
}

function accountName(id: string) {
  return accounts.value.find((account) => account.id === id)?.name ?? id;
}

function channelName(accountId: string, bindingId: string) {
  return (
    accounts.value
      .find((account) => account.id === accountId)
      ?.channels.find((channel) => channel.id === bindingId)?.channelName ??
    bindingId
  );
}
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
      <BusinessScopeSelect v-model="tenantId" @ready="refresh" />
      <AButton
        v-access:code="['merchant:account:create']"
        :disabled="!tenantId"
        type="primary"
        @click="createOpen = true"
      >
        新增商家
      </AButton>
    </div>
    <ATable
      :data-source="items"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 960 }"
    >
      <ATableColumn data-index="name" title="商家名称" :width="190" />
      <ATableColumn data-index="code" title="商家编码" :width="150" />
      <ATableColumn key="platform" title="交易平台" :width="110">
        <template #default="{ record }">
          {{ merchantPlatformText(record.platform) }}
        </template>
      </ATableColumn>
      <ATableColumn
        data-index="externalMerchantId"
        title="平台商家编号"
        :width="180"
      >
        <template #default="{ text }">{{ text || '-' }}</template>
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
      <ATableColumn key="action" fixed="right" title="操作" :width="120">
        <template #default="{ record }">
          <AButton size="small" type="link" @click="openConfig(record)">
            配置
          </AButton>
        </template>
      </ATableColumn>
    </ATable>

    <AModal v-model:open="createOpen" title="新增商家" @ok="submitMerchant">
      <AForm ref="createFormRef" :model="createForm" layout="vertical">
        <AFormItem
          label="商家名称"
          name="name"
          :rules="[{ required: true, message: '请输入商家名称' }]"
        >
          <AInput v-model:value="createForm.name" />
        </AFormItem>
        <AFormItem
          label="商家编码"
          name="code"
          :rules="[{ required: true, message: '请输入商家编码' }]"
        >
          <AInput v-model:value="createForm.code" />
        </AFormItem>
        <AFormItem
          label="交易平台"
          name="platform"
          :rules="[{ required: true, message: '请选择交易平台' }]"
        >
          <ASelect
            v-model:value="createForm.platform"
            :options="merchantPlatformOptions"
          />
        </AFormItem>
        <AFormItem label="平台商家编号">
          <AInput v-model:value="createForm.externalMerchantId" />
        </AFormItem>
      </AForm>
    </AModal>

    <ADrawer
      v-model:open="configOpen"
      :title="selectedMerchant?.name"
      width="min(720px, 94vw)"
    >
      <ATabs>
        <ATabPane key="credential" tab="平台凭据">
          <div class="mb-3 flex justify-end">
            <AButton
              v-access:code="['merchant:account:credential']"
              type="primary"
              @click="openCredential"
            >
              更新凭据
            </AButton>
          </div>
          <ATable
            :data-source="credentials"
            row-key="id"
            size="small"
            :pagination="false"
          >
            <ATableColumn data-index="version" title="版本" :width="80" />
            <ATableColumn key="configured" title="凭据" :width="100">
              <template #default="{ record }">
                <ATag
                  :color="record.credentialConfigured ? 'success' : 'warning'"
                >
                  {{ record.credentialConfigured ? '已配置' : '未配置' }}
                </ATag>
              </template>
            </ATableColumn>
            <ATableColumn key="status" title="状态" :width="100">
              <template #default="{ record }">
                {{ businessStatusText(record.status) }}
              </template>
            </ATableColumn>
            <ATableColumn key="createdAt" title="更新时间">
              <template #default="{ record }">
                {{ formatBusinessTime(record.createdAt) }}
              </template>
            </ATableColumn>
          </ATable>
        </ATabPane>
        <ATabPane key="plans" tab="支付方案">
          <div class="mb-3 flex justify-end">
            <AButton
              v-access:code="['payment:account:bind']"
              :disabled="accounts.length === 0"
              type="primary"
              @click="openPlan"
            >
              新增方案
            </AButton>
          </div>
          <AAlert
            v-if="accounts.length === 0"
            class="mb-3"
            message="请先创建支付账号并开通支付通道"
            show-icon
            type="info"
          />
          <ATable
            :data-source="plans"
            row-key="id"
            size="small"
            :scroll="{ x: 700 }"
          >
            <ATableColumn data-index="scene" title="场景" :width="120" />
            <ATableColumn key="account" title="支付账号" :width="160">
              <template #default="{ record }">
                {{ accountName(record.paymentAccountId) }}
              </template>
            </ATableColumn>
            <ATableColumn key="channel" title="支付通道" :width="180">
              <template #default="{ record }">
                {{
                  channelName(
                    record.paymentAccountId,
                    record.paymentAccountChannelId,
                  )
                }}
              </template>
            </ATableColumn>
            <ATableColumn data-index="priority" title="顺序" :width="80" />
            <ATableColumn data-index="weight" title="比例" :width="80" />
            <ATableColumn key="status" title="状态" :width="90">
              <template #default="{ record }">
                {{ businessStatusText(record.status) }}
              </template>
            </ATableColumn>
          </ATable>
        </ATabPane>
      </ATabs>
    </ADrawer>

    <AModal
      v-model:open="credentialOpen"
      title="更新平台凭据"
      @ok="submitCredential"
    >
      <AAlert
        class="mb-4"
        message="凭据仅保存引用，提交后不会显示原值"
        show-icon
        type="info"
      />
      <AForm ref="credentialFormRef" :model="credentialForm" layout="vertical">
        <AFormItem
          label="Secret 引用"
          name="credentialRef"
          :rules="[{ required: true, message: '请输入 Secret 引用' }]"
        >
          <AInputPassword
            v-model:value="credentialForm.credentialRef"
            autocomplete="new-password"
          />
        </AFormItem>
        <template v-if="selectedMerchant?.platform === 'BINANCE'">
          <AFormItem
            label="客户端类型"
            name="clientType"
            :rules="[{ required: true, message: '请输入客户端类型' }]"
          >
            <AInput v-model:value="credentialForm.clientType" />
          </AFormItem>
          <AFormItem label="X-User-ID">
            <AInput v-model:value="credentialForm.xUserId" />
          </AFormItem>
        </template>
        <AFormItem label="请求超时（毫秒）">
          <AInputNumber
            v-model:value="credentialForm.requestTimeoutMs"
            :min="1000"
            :max="60000"
          />
        </AFormItem>
      </AForm>
    </AModal>

    <AModal v-model:open="planOpen" title="新增支付方案" @ok="submitPlan">
      <AForm ref="planFormRef" :model="planForm" layout="vertical">
        <AFormItem label="业务场景" required>
          <AInput v-model:value="planForm.scene" disabled />
        </AFormItem>
        <AFormItem
          label="支付账号"
          name="paymentAccountId"
          :rules="[{ required: true, message: '请选择支付账号' }]"
        >
          <ASelect
            v-model:value="planForm.paymentAccountId"
            :options="accountOptions"
            @change="onAccountChange"
          />
        </AFormItem>
        <AFormItem
          label="账号支付通道"
          name="paymentAccountChannelId"
          :rules="[{ required: true, message: '请选择账号支付通道' }]"
        >
          <ASelect
            v-model:value="planForm.paymentAccountChannelId"
            :disabled="!planForm.paymentAccountId"
            :options="channelOptions"
          />
        </AFormItem>
        <AFormItem label="币种">
          <AInput v-model:value="planForm.currency" disabled />
        </AFormItem>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AFormItem
            label="使用顺序"
            name="priority"
            :rules="[{ required: true, message: '请输入使用顺序' }]"
          >
            <AInputNumber
              v-model:value="planForm.priority"
              :min="1"
              :max="1000"
              style="width: 100%"
            />
          </AFormItem>
          <AFormItem
            label="分配比例"
            name="weight"
            :rules="[{ required: true, message: '请输入分配比例' }]"
          >
            <AInputNumber
              v-model:value="planForm.weight"
              :min="1"
              :max="100"
              style="width: 100%"
            />
          </AFormItem>
        </div>
      </AForm>
    </AModal>
  </Page>
</template>
