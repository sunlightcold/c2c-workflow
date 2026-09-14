<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createMerchantApi,
  createPaymentPlanApi,
  deleteMerchantApi,
  deleteMerchantCredentialApi,
  deletePaymentPlanApi,
  filterMerchantsApi,
  getMerchantCredentialsApi,
  getPaymentAccountsApi,
  getPaymentBatchPoliciesApi,
  getPaymentPlansApi,
  getTelegramBotsApi,
  getTelegramGroupsApi,
  rotateMerchantCredentialApi,
  setMerchantStatusApi,
  setPaymentPlanStatusApi,
  syncMerchantOrdersApi,
  testMerchantConnectionApi,
  updateMerchantApi,
  updatePaymentPlanApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessStatusOptions,
  businessStatusText,
  formatBusinessTime,
  merchantPlatformOptions,
  merchantPlatformText,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';
import {
  createMerchantAccountModalOptions,
  createPaymentPlanModalOptions,
  DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
  DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
  DEFAULT_ORDER_PAID_CHAT_MESSAGE,
  editMerchantAccountModalOptions,
  editPaymentPlanModalOptions,
  rotateMerchantCredentialModalOptions,
} from './schema';

type SearchValues = {
  accountName?: string;
  externalMerchantId?: string;
  platform?: BusinessApi.MerchantPlatform;
  status?: BusinessApi.BusinessStatus;
  tenantId?: string;
};

type MerchantQueryParams = Omit<BusinessApi.MerchantQuery, 'page'> & {
  pageIndex: number;
};

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const configOpen = ref(false);
const configLoading = ref(false);
const selectedMerchant = ref<BusinessApi.Merchant>();
const credentials = ref<BusinessApi.MerchantCredential[]>([]);
const paymentAccounts = ref<BusinessApi.PaymentAccount[]>([]);
const paymentPlans = ref<BusinessApi.PaymentPlan[]>([]);
const paymentBatchPolicies = ref<BusinessApi.PaymentBatchPolicy[]>([]);
const testingId = ref<string>();
const syncingId = ref<string>();
const editingId = ref<string>();

type MerchantGroupBinding = {
  bot: BusinessApi.TelegramBot;
  group: BusinessApi.TelegramGroup;
};

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => void selectTenant(value),
        options: tenantOptions,
        placeholder: '请选择经营单位',
        showSearch: true,
      }),
      fieldName: 'tenantId',
      label: '经营单位',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入账号名称' },
      fieldName: 'accountName',
      label: '账号名称',
    },
    {
      component: 'Input',
      componentProps: { placeholder: '请输入平台商家编号' },
      fieldName: 'externalMerchantId',
      label: '平台商家编号',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: merchantPlatformOptions,
        placeholder: '全部平台',
      },
      fieldName: 'platform',
      label: '交易平台',
    },
    {
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: businessStatusOptions,
        placeholder: '全部状态',
      },
      fieldName: 'status',
      label: '状态',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.Merchant> = {
  columnConfig: { resizable: true },
  columns: [
    { type: 'seq', width: 60 },
    {
      field: 'name',
      title: '商家账号',
      minWidth: 180,
    },
    {
      field: 'platform',
      slots: { default: 'platform' },
      title: '交易平台',
      width: 100,
    },
    { field: 'externalMerchantId', minWidth: 170, title: '平台商家编号' },
    {
      field: 'credentialConfigured',
      slots: { default: 'credential' },
      title: '平台凭据',
      width: 110,
    },
    {
      field: 'automaticPayment',
      slots: { default: 'automaticPayment' },
      title: '自动支付',
      width: 150,
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 110,
    },
    {
      field: 'updatedAt',
      formatter: ({ cellValue }) => formatBusinessTime(cellValue as string),
      title: '更新时间',
      width: 180,
    },
    {
      align: 'center',
      field: 'active',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 320,
    },
  ],
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.Merchant,
  SearchValues,
  MerchantQueryParams
>({
  formOptions,
  gridOptions,
  mapQueryParams: ({ formValues, page }) => ({
    ...formValues,
    pageIndex: page.currentPage,
    pageSize: page.pageSize,
  }),
  query: async (params) => {
    const tenantId = params.tenantId ?? selectedTenantId.value;
    selectedTenantId.value = tenantId;
    if (!tenantId) {
      return createEmptyBusinessPage(params.pageIndex, params.pageSize);
    }
    const { pageIndex, ...query } = params;
    return filterMerchantsApi({ ...query, page: pageIndex, tenantId });
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string) {
  selectedTenantId.value = tenantId;
  await gridApi.formApi.setFieldValue('tenantId', tenantId);
  await gridApi.query();
}

function cleanOptionalStrings<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      typeof item === 'string' && item.trim() === '' ? undefined : item,
    ]),
  ) as T;
}

function normalizeCreateForm(
  data: BusinessApi.CreateMerchantInput,
): BusinessApi.CreateMerchantInput {
  const payload = cleanOptionalStrings({ ...data });
  if (payload.platform === 'BINANCE') {
    delete payload.authorization;
    delete payload.sessionCookie;
    delete payload.signaturePrivateKey;
  } else {
    delete payload.apiKey;
    delete payload.secretKey;
    delete payload.clientType;
    delete payload.xUserId;
  }
  return payload;
}

async function createMerchant() {
  const values = (await gridApi.formApi.getValues()) as SearchValues;
  const tenantId = values.tenantId ?? selectedTenantId.value;
  if (!tenantId) return;
  selectedTenantId.value = tenantId;
  formModalShow(createMerchantAccountModalOptions(), {
    onOk: async (api) => {
      await api.validate();
      const data = normalizeCreateForm(
        api.formData() as BusinessApi.CreateMerchantInput,
      );
      await runResourceAction({
        action: () => createMerchantApi({ ...data, tenantId }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '商家账号已新增',
      });
    },
  });
}

async function editMerchant(merchant: BusinessApi.Merchant) {
  editingId.value = merchant.id;
  try {
    const groupBindings = await loadMerchantGroupBindings(merchant);
    const matchedGroupId = groupBindings.find(
      ({ bot, group }) =>
        bot.code === merchant.botCode && group.chatId === merchant.chatId,
    )?.group.id;
    // 机器人命令绑定后，群组记录是权威来源；历史商家数据可能尚未回写
    // botCode/chatId。商家只有一个有效群组时直接回显，避免用户重复选择。
    const currentGroupId =
      matchedGroupId ??
      (groupBindings.length === 1 ? groupBindings[0]?.group.id : undefined);
    const groupOptions = groupBindings.map(({ bot, group }) => ({
      label: `${group.name} · ${bot.name}`,
      value: group.id,
    }));
    const [formApi] = await formModalShow(
      editMerchantAccountModalOptions(merchant.platform, groupOptions),
      {
        onOk: async (api) => {
          await api.validate();
          const raw = api.formData() as BusinessApi.UpdateMerchantInput;
          const data = cleanOptionalStrings({ ...raw });
          if (!raw.telegramGroupId && currentGroupId) {
            data.telegramGroupId = null;
          } else if (!raw.telegramGroupId) {
            delete data.telegramGroupId;
          }
          await runResourceAction({
            action: () =>
              updateMerchantApi(merchant.id, {
                ...data,
                tenantId: selectedTenantId.value,
              }),
            onSuccess: async () => {
              formModalClose();
              await gridApi.query();
            },
            successMessage: '商家账号已更新',
          });
        },
      },
    );
    formApi?.setValue({
      ...merchant,
      c2cChatOrderCompletedMessage:
        merchant.c2cChatOrderCompletedMessage ||
        DEFAULT_ORDER_COMPLETED_CHAT_MESSAGE,
      c2cChatOrderCreatedMessage:
        merchant.c2cChatOrderCreatedMessage ||
        DEFAULT_ORDER_CREATED_CHAT_MESSAGE,
      c2cChatOrderPaidMessage:
        merchant.c2cChatOrderPaidMessage || DEFAULT_ORDER_PAID_CHAT_MESSAGE,
      description: merchant.description ?? '',
      telegramGroupId: currentGroupId ?? '',
    });
  } finally {
    editingId.value = undefined;
  }
}

async function loadMerchantGroupBindings(
  merchant: BusinessApi.Merchant,
): Promise<MerchantGroupBinding[]> {
  const [groups, bots] = await Promise.all([
    getTelegramGroupsApi({
      bindingState: 'ACTIVE',
      merchantId: merchant.id,
      page: 1,
      pageSize: 100,
      tenantId: selectedTenantId.value,
    }),
    getTelegramBotsApi({
      page: 1,
      pageSize: 100,
      status: 'active',
      tenantId: selectedTenantId.value,
    }),
  ]);
  const botById = new Map(
    bots.items
      .filter(
        ({ botType, status }) => botType === 'PAYMENT' && status === 'active',
      )
      .map((bot) => [bot.id, bot]),
  );
  return groups.items.flatMap((group) => {
    const bot = botById.get(group.botId);
    return group.bindingState === 'ACTIVE' &&
      group.paymentScene === 'C2C_BUY' &&
      group.chatId &&
      bot
      ? [{ bot, group }]
      : [];
  });
}

function changeStatus(merchant: BusinessApi.Merchant, checked: boolean) {
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setMerchantStatusApi(merchant.id, status, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '商家账号已启用' : '商家账号已停用',
  });
}

function removeMerchant(merchant: BusinessApi.Merchant) {
  confirmResourceAction({
    action: () => deleteMerchantApi(merchant.id, selectedTenantId.value),
    content: '已有订单的账号不能删除，只能停用。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: () => gridApi.query(),
    successMessage: '商家账号已删除',
    title: `确认删除“${merchant.name}”吗？`,
  });
}

async function testConnection(merchant: BusinessApi.Merchant) {
  testingId.value = merchant.id;
  try {
    await runResourceAction({
      action: () =>
        testMerchantConnectionApi(merchant.id, selectedTenantId.value),
      successMessage: `${merchantPlatformText(merchant.platform)}连接正常`,
    });
  } finally {
    testingId.value = undefined;
  }
}

async function syncOrders(merchant: BusinessApi.Merchant) {
  syncingId.value = merchant.id;
  try {
    await runResourceAction({
      action: () =>
        syncMerchantOrdersApi(merchant.id, {
          tenantId: selectedTenantId.value,
        }),
      onSuccess: () => gridApi.query(),
      successMessage: '商家订单同步完成',
    });
  } finally {
    syncingId.value = undefined;
  }
}

async function openConfig(merchant: BusinessApi.Merchant) {
  selectedMerchant.value = merchant;
  configOpen.value = true;
  configLoading.value = true;
  try {
    const [merchantCredentials, accounts, plans, policies] = await Promise.all([
      getMerchantCredentialsApi(merchant.id, {
        tenantId: selectedTenantId.value,
      }),
      getPaymentAccountsApi({ tenantId: selectedTenantId.value }),
      getPaymentPlansApi({
        merchantId: merchant.id,
        tenantId: selectedTenantId.value,
      }),
      getPaymentBatchPoliciesApi({
        applicableMerchantId: merchant.id,
        page: 1,
        pageSize: 100,
        status: 'active',
        tenantId: selectedTenantId.value,
      }),
    ]);
    credentials.value = merchantCredentials;
    paymentAccounts.value = accounts;
    paymentPlans.value = plans;
    paymentBatchPolicies.value = policies.items;
  } finally {
    configLoading.value = false;
  }
}

function rotateCredential() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  formModalShow(rotateMerchantCredentialModalOptions(merchant.platform), {
    onOk: async (api) => {
      await api.validate();
      await runResourceAction({
        action: () =>
          rotateMerchantCredentialApi(merchant.id, {
            ...cleanOptionalStrings(api.formData()),
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          credentials.value = await getMerchantCredentialsApi(merchant.id, {
            tenantId: selectedTenantId.value,
          });
          await gridApi.query();
        },
        successMessage: '平台凭据已更新',
      });
    },
  });
}

function removeCredential(credential: BusinessApi.MerchantCredential) {
  const merchant = selectedMerchant.value;
  if (!merchant || credential.status === 'active') return;
  confirmResourceAction({
    action: () =>
      deleteMerchantCredentialApi(
        merchant.id,
        credential.id,
        selectedTenantId.value,
      ),
    content: '仅可删除已停用的历史凭据版本。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: async () => {
      credentials.value = await getMerchantCredentialsApi(merchant.id, {
        tenantId: selectedTenantId.value,
      });
    },
    successMessage: '历史凭据已删除',
    title: `确认删除凭据版本 ${credential.version} 吗？`,
  });
}

function createPaymentPlan() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  const routes = paymentPlanRouteOptions();
  formModalShow(
    createPaymentPlanModalOptions(routes, paymentBatchPolicyOptions()),
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as {
          batchPolicyId?: string;
          priority: number;
          routeKey: string;
          weight: number;
        };
        const [paymentAccountId, paymentAccountChannelId] =
          data.routeKey.split(':');
        await runResourceAction({
          action: () =>
            createPaymentPlanApi({
              batchPolicyId: data.batchPolicyId || null,
              currency: 'CNY',
              merchantId: merchant.id,
              paymentAccountChannelId: paymentAccountChannelId!,
              paymentAccountId: paymentAccountId!,
              priority: data.priority,
              scene: 'C2C_BUY',
              tenantId: selectedTenantId.value,
              weight: data.weight,
            }),
          onSuccess: async () => {
            formModalClose();
            await reloadPaymentPlans();
          },
          successMessage: '支付方案已新增',
        });
      },
    },
  );
}

function paymentPlanRouteOptions() {
  return paymentAccounts.value.flatMap((account) =>
    account.status === 'active'
      ? account.channels
          .filter((channel) => channel.status === 'active')
          .flatMap((channel) =>
            channel.executionMode
              ? [
                  {
                    executionMode: channel.executionMode,
                    label: `${account.name} · ${channel.channelName ?? '未知支付通道'}`,
                    value: `${account.id}:${channel.id}`,
                  },
                ]
              : [],
          )
      : [],
  );
}

function paymentBatchPolicyOptions() {
  return paymentBatchPolicies.value.map((policy) => ({
    label:
      policy.scopeType === 'GLOBAL'
        ? `全局 · ${policy.name}`
        : `商家 · ${policy.name}`,
    value: policy.id,
  }));
}

async function reloadPaymentPlans() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  paymentPlans.value = await getPaymentPlansApi({
    merchantId: merchant.id,
    tenantId: selectedTenantId.value,
  });
}

async function editPaymentPlan(plan: BusinessApi.PaymentPlan) {
  const [formApi] = await formModalShow(
    editPaymentPlanModalOptions(
      paymentPlanRouteOptions(),
      paymentBatchPolicyOptions(),
    ),
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as {
          batchPolicyId?: string;
          priority: number;
          routeKey: string;
          weight: number;
        };
        const [paymentAccountId, paymentAccountChannelId] =
          data.routeKey.split(':');
        await runResourceAction({
          action: () =>
            updatePaymentPlanApi(plan.id, {
              batchPolicyId: data.batchPolicyId || null,
              paymentAccountChannelId: paymentAccountChannelId!,
              paymentAccountId: paymentAccountId!,
              priority: data.priority,
              tenantId: selectedTenantId.value,
              weight: data.weight,
            }),
          onSuccess: async () => {
            formModalClose();
            await reloadPaymentPlans();
          },
          successMessage: '支付方案已更新',
        });
      },
    },
  );
  formApi?.setValue({
    batchPolicyId: plan.batchPolicyId ?? '',
    priority: plan.priority,
    routeKey: `${plan.paymentAccountId}:${plan.paymentAccountChannelId}`,
    weight: plan.weight,
  });
}

function changePaymentPlanStatus(
  plan: BusinessApi.PaymentPlan,
  checked: boolean,
) {
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setPaymentPlanStatusApi(plan.id, status, selectedTenantId.value),
    onSuccess: reloadPaymentPlans,
    successMessage: status === 'active' ? '支付方案已启用' : '支付方案已停用',
  });
}

function removePaymentPlan(plan: BusinessApi.PaymentPlan) {
  confirmResourceAction({
    action: () => deletePaymentPlanApi(plan.id, selectedTenantId.value),
    content: '已被支付订单使用的方案不能删除，只能停用。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: reloadPaymentPlans,
    successMessage: '支付方案已删除',
    title: '确认删除支付方案吗？',
  });
}

function paymentAccountName(id: string) {
  return (
    paymentAccounts.value.find((item) => item.id === id)?.name ?? '未知支付账号'
  );
}

function paymentChannelName(accountId: string, channelId: string) {
  return (
    paymentAccounts.value
      .find((item) => item.id === accountId)
      ?.channels.find((item) => item.id === channelId)?.channelName ??
    '未知支付通道'
  );
}

function paymentBatchPolicyName(id: null | string) {
  if (!id) return '-';
  return (
    paymentBatchPolicies.value.find((item) => item.id === id)?.name ?? '已失效'
  );
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (selectedTenantId.value) {
    await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
    await gridApi.query();
  }
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['merchant:account:create']"
          :disabled="tenantOptions.length === 0"
          size="small"
          type="primary"
          @click="createMerchant"
        >
          新增商家账号
        </AButton>
      </template>
      <template #platform="{ row }">
        {{ merchantPlatformText(row.platform) }}
      </template>
      <template #credential="{ row }">
        <ATag :color="row.credentialConfigured ? 'success' : 'warning'">
          {{ row.credentialConfigured ? '已配置' : '未配置' }}
        </ATag>
      </template>
      <template #automaticPayment="{ row }">
        <ATag v-if="row.automaticPaymentEnabled" color="success">
          {{
            row.automaticPaymentExecutionMode === 'BATCH'
              ? '批次付款'
              : '单笔付款'
          }}
        </ATag>
        <ATag v-else>未开启</ATag>
      </template>
      <template #status="{ row }">
        <AsyncStatusSwitch
          v-access:code="['merchant:account:update']"
          :checked="row.status === 'active'"
          :label="`${row.name}状态`"
          :request="(checked) => changeStatus(row, checked)"
        />
      </template>
      <template #action="{ row }">
        <div
          class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
        >
          <AButton
            v-access:code="['merchant:account:test']"
            class="px-1"
            :loading="testingId === row.id"
            size="small"
            type="link"
            @click="testConnection(row)"
          >
            测试
          </AButton>
          <AButton
            v-access:code="['merchant:order:sync']"
            class="px-1"
            :loading="syncingId === row.id"
            size="small"
            type="link"
            @click="syncOrders(row)"
          >
            同步
          </AButton>
          <AButton
            class="px-1"
            size="small"
            type="link"
            @click="openConfig(row)"
          >
            配置
          </AButton>
          <AButton
            v-access:code="['merchant:account:update']"
            class="px-1"
            :loading="editingId === row.id"
            size="small"
            type="link"
            @click="editMerchant(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['merchant:account:delete']"
            class="px-1"
            danger
            size="small"
            type="link"
            @click="removeMerchant(row)"
          >
            删除
          </AButton>
        </div>
      </template>
    </Grid>

    <ADrawer
      v-model:open="configOpen"
      :title="
        selectedMerchant ? `${selectedMerchant.name} · 账号配置` : '账号配置'
      "
      width="min(760px, 94vw)"
    >
      <ASpin :spinning="configLoading">
        <ATabs>
          <ATabPane key="credentials" tab="平台凭据">
            <div class="mb-3 flex justify-end">
              <AButton
                v-access:code="['merchant:account:credential']"
                size="small"
                type="primary"
                @click="rotateCredential"
              >
                更新凭据
              </AButton>
            </div>
            <ATable
              :data-source="credentials"
              :pagination="false"
              row-key="id"
              size="small"
            >
              <ATableColumn data-index="version" title="版本" :width="80" />
              <ATableColumn key="configured" title="凭据" :width="100">
                <template #default>
                  <ATag color="success">已配置</ATag>
                </template>
              </ATableColumn>
              <ATableColumn key="status" title="状态" :width="100">
                <template #default="{ record }">
                  {{ businessStatusText(record.status) }}
                </template>
              </ATableColumn>
              <ATableColumn data-index="clientType" title="客户端类型" />
              <ATableColumn
                data-index="requestTimeoutMs"
                title="超时（毫秒）"
                :width="130"
              />
              <ATableColumn
                align="center"
                key="action"
                title="操作"
                :width="160"
              >
                <template #default="{ record }">
                  <div
                    class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
                  >
                    <AButton
                      v-access:code="['merchant:account:credential']"
                      class="px-1"
                      size="small"
                      type="link"
                      @click="rotateCredential"
                    >
                      更新
                    </AButton>
                    <AButton
                      v-access:code="['merchant:account:credential']"
                      class="px-1"
                      :disabled="record.status === 'active'"
                      danger
                      size="small"
                      type="link"
                      @click="removeCredential(record)"
                    >
                      删除
                    </AButton>
                  </div>
                </template>
              </ATableColumn>
            </ATable>
          </ATabPane>
          <ATabPane key="payment-plans" tab="支付方案">
            <div class="mb-3 flex justify-end">
              <AButton
                v-access:code="['payment:account:bind']"
                :disabled="paymentAccounts.length === 0"
                size="small"
                type="primary"
                @click="createPaymentPlan"
              >
                新增方案
              </AButton>
            </div>
            <AAlert
              v-if="paymentAccounts.length === 0"
              class="mb-3"
              message="请先创建支付账号并开通支付通道"
              show-icon
              type="info"
            />
            <ATable
              :data-source="paymentPlans"
              data-testid="payment-plan-table"
              :pagination="false"
              row-key="id"
              size="small"
              :scroll="{ x: 1040 }"
            >
              <ATableColumn key="account" title="支付账号" :width="180">
                <template #default="{ record }">
                  {{ paymentAccountName(record.paymentAccountId) }}
                </template>
              </ATableColumn>
              <ATableColumn key="channel" title="支付通道" :width="180">
                <template #default="{ record }">
                  {{
                    paymentChannelName(
                      record.paymentAccountId,
                      record.paymentAccountChannelId,
                    )
                  }}
                </template>
              </ATableColumn>
              <ATableColumn key="mode" title="付款模式" :width="110">
                <template #default="{ record }">
                  {{
                    paymentAccounts
                      .find((item) => item.id === record.paymentAccountId)
                      ?.channels.find(
                        (item) => item.id === record.paymentAccountChannelId,
                      )?.executionMode === 'BATCH'
                      ? '批次付款'
                      : '单笔付款'
                  }}
                </template>
              </ATableColumn>
              <ATableColumn key="batchPolicy" title="批次策略" :width="150">
                <template #default="{ record }">
                  {{ paymentBatchPolicyName(record.batchPolicyId) }}
                </template>
              </ATableColumn>
              <ATableColumn
                data-index="priority"
                title="使用顺序"
                :width="100"
              />
              <ATableColumn data-index="weight" title="分配比例" :width="100" />
              <ATableColumn key="status" title="状态" :width="90">
                <template #default="{ record }">
                  <AsyncStatusSwitch
                    v-access:code="['payment:account:bind']"
                    :checked="record.status === 'active'"
                    :label="`${paymentAccountName(record.paymentAccountId)}支付方案状态`"
                    :request="
                      (checked) => changePaymentPlanStatus(record, checked)
                    "
                  />
                </template>
              </ATableColumn>
              <ATableColumn
                align="center"
                key="action"
                fixed="right"
                title="操作"
                :width="150"
              >
                <template #default="{ record }">
                  <div
                    class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
                  >
                    <AButton
                      v-access:code="['payment:account:bind']"
                      class="px-1"
                      size="small"
                      type="link"
                      @click="editPaymentPlan(record)"
                    >
                      编辑
                    </AButton>
                    <AButton
                      v-access:code="['payment:account:bind']"
                      class="px-1"
                      danger
                      size="small"
                      type="link"
                      @click="removePaymentPlan(record)"
                    >
                      删除
                    </AButton>
                  </div>
                </template>
              </ATableColumn>
            </ATable>
          </ATabPane>
        </ATabs>
      </ASpin>
    </ADrawer>
    <FormModalRender />
  </Page>
</template>
