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
  deletePaymentPlanApi,
  filterMerchantsApi,
  getMerchantCredentialsApi,
  getPaymentAccountsApi,
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
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessStatusColor,
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
  accountCode?: string;
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
      componentProps: { placeholder: '请输入账号编码' },
      fieldName: 'accountCode',
      label: '账号编码',
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
  cellConfig: { height: 64 },
  columnConfig: { resizable: true },
  columns: [
    { align: 'center', type: 'seq', width: 60 },
    {
      align: 'center',
      field: 'account',
      slots: { default: 'account' },
      title: '商家账号',
      width: 220,
    },
    {
      align: 'center',
      field: 'platform',
      slots: { default: 'platform' },
      title: '交易平台',
      width: 100,
    },
    { field: 'externalMerchantId', minWidth: 170, title: '平台商家编号' },
    {
      align: 'center',
      field: 'credentialConfigured',
      slots: { default: 'credential' },
      title: '平台凭据',
      width: 110,
    },
    {
      field: 'syncConfig',
      slots: { default: 'syncConfig' },
      title: '同步配置',
      width: 190,
    },
    {
      field: 'botConfig',
      slots: { default: 'botConfig' },
      title: '聊天通知',
      width: 190,
    },
    {
      align: 'center',
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 90,
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
      width: 370,
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
  } else {
    delete payload.apiKey;
    delete payload.secretKey;
    delete payload.clientType;
    delete payload.xUserId;
    for (const field of [
      'c2cChatOrderCreatedEnabled',
      'c2cChatOrderCreatedMessage',
      'c2cChatOrderPaidEnabled',
      'c2cChatOrderPaidMessage',
      'c2cChatOrderCompletedEnabled',
      'c2cChatOrderCompletedMessage',
      'autoAppealEnabled',
      'autoAppealDelayMinutes',
    ] as const) {
      delete payload[field];
    }
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
    const currentGroupId = groupBindings.find(
      ({ bot, group }) =>
        bot.code === merchant.botCode && group.chatId === merchant.chatId,
    )?.group.id;
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

function toggleStatus(merchant: BusinessApi.Merchant) {
  const status = merchant.status === 'active' ? 'disabled' : 'active';
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
    [credentials.value, paymentAccounts.value, paymentPlans.value] =
      await Promise.all([
        getMerchantCredentialsApi(merchant.id, {
          tenantId: selectedTenantId.value,
        }),
        getPaymentAccountsApi({ tenantId: selectedTenantId.value }),
        getPaymentPlansApi({
          merchantId: merchant.id,
          tenantId: selectedTenantId.value,
        }),
      ]);
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

function createPaymentPlan() {
  const merchant = selectedMerchant.value;
  if (!merchant) return;
  const routes = paymentPlanRouteOptions();
  formModalShow(createPaymentPlanModalOptions(routes), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as {
        priority: number;
        routeKey: string;
        weight: number;
      };
      const [paymentAccountId, paymentAccountChannelId] =
        data.routeKey.split(':');
      await runResourceAction({
        action: () =>
          createPaymentPlanApi({
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
  });
}

function paymentPlanRouteOptions() {
  return paymentAccounts.value.flatMap((account) =>
    account.status === 'active'
      ? account.channels
          .filter((channel) => channel.status === 'active')
          .map((channel) => ({
            label: `${account.name} · ${channel.channelName ?? channel.channelCode}`,
            value: `${account.id}:${channel.id}`,
          }))
      : [],
  );
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
    editPaymentPlanModalOptions(paymentPlanRouteOptions()),
    {
      onOk: async (api) => {
        await api.validate();
        const data = api.formData() as {
          priority: number;
          routeKey: string;
          weight: number;
        };
        const [paymentAccountId, paymentAccountChannelId] =
          data.routeKey.split(':');
        await runResourceAction({
          action: () =>
            updatePaymentPlanApi(plan.id, {
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
    priority: plan.priority,
    routeKey: `${plan.paymentAccountId}:${plan.paymentAccountChannelId}`,
    weight: plan.weight,
  });
}

function togglePaymentPlanStatus(plan: BusinessApi.PaymentPlan) {
  const status = plan.status === 'active' ? 'disabled' : 'active';
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
    zIndex: 2100,
  });
}

function paymentAccountName(id: string) {
  return paymentAccounts.value.find((item) => item.id === id)?.name ?? id;
}

function paymentChannelName(accountId: string, channelId: string) {
  return (
    paymentAccounts.value
      .find((item) => item.id === accountId)
      ?.channels.find((item) => item.id === channelId)?.channelName ?? channelId
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
      <template #account="{ row }">
        <div
          class="inline-grid grid-cols-[48px_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-left"
        >
          <ATag class="m-0 text-center" color="blue">名称</ATag>
          <span class="truncate">{{ row.name }}</span>
          <ATag class="m-0 text-center">编码</ATag>
          <span class="truncate tabular-nums">{{ row.code }}</span>
        </div>
      </template>
      <template #platform="{ row }">
        {{ merchantPlatformText(row.platform) }}
      </template>
      <template #credential="{ row }">
        <ATag :color="row.credentialConfigured ? 'success' : 'warning'">
          {{ row.credentialConfigured ? '已配置' : '未配置' }}
        </ATag>
      </template>
      <template #syncConfig="{ row }">
        <div class="text-sm tabular-nums leading-6">
          <div>每页 {{ row.pageSize }} 笔</div>
          <div>重叠 {{ row.overlapSeconds }} 秒</div>
        </div>
      </template>
      <template #botConfig="{ row }">
        <div v-if="row.botCode" class="text-sm leading-6">
          <div>{{ row.botCode }}</div>
          <div class="text-muted-foreground">
            {{ row.chatId || '未绑定群组' }}
          </div>
        </div>
        <span v-else class="text-muted-foreground">未配置</span>
      </template>
      <template #status="{ row }">
        <ATag :color="businessStatusColor(row.status)">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #action="{ row }">
        <ASpace :size="4">
          <AButton
            v-access:code="['merchant:account:test']"
            :loading="testingId === row.id"
            size="small"
            @click="testConnection(row)"
          >
            测试
          </AButton>
          <AButton
            v-access:code="['merchant:order:sync']"
            :loading="syncingId === row.id"
            size="small"
            @click="syncOrders(row)"
          >
            同步
          </AButton>
          <AButton size="small" @click="openConfig(row)">配置</AButton>
          <AButton
            v-access:code="['merchant:account:update']"
            :loading="editingId === row.id"
            size="small"
            type="link"
            @click="editMerchant(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['merchant:account:update']"
            size="small"
            type="link"
            @click="toggleStatus(row)"
          >
            {{ row.status === 'active' ? '停用' : '启用' }}
          </AButton>
          <AButton
            v-access:code="['merchant:account:delete']"
            danger
            size="small"
            type="link"
            @click="removeMerchant(row)"
          >
            删除
          </AButton>
        </ASpace>
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
              :scroll="{ x: 820 }"
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
              <ATableColumn
                data-index="priority"
                title="使用顺序"
                :width="100"
              />
              <ATableColumn data-index="weight" title="分配比例" :width="100" />
              <ATableColumn key="status" title="状态" :width="90">
                <template #default="{ record }">
                  <ATag :color="businessStatusColor(record.status)">
                    {{ businessStatusText(record.status) }}
                  </ATag>
                </template>
              </ATableColumn>
              <ATableColumn
                key="action"
                fixed="right"
                title="操作"
                :width="210"
              >
                <template #default="{ record }">
                  <ASpace :size="4">
                    <AButton
                      v-access:code="['payment:account:bind']"
                      size="small"
                      type="link"
                      @click="editPaymentPlan(record)"
                    >
                      编辑
                    </AButton>
                    <AButton
                      v-access:code="['payment:account:bind']"
                      size="small"
                      type="link"
                      @click="togglePaymentPlanStatus(record)"
                    >
                      {{ record.status === 'active' ? '停用' : '启用' }}
                    </AButton>
                    <AButton
                      v-access:code="['payment:account:bind']"
                      danger
                      size="small"
                      type="link"
                      @click="removePaymentPlan(record)"
                    >
                      删除
                    </AButton>
                  </ASpace>
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
