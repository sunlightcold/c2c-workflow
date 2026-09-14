<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { usePreferences } from '@vben/preferences';

import {
  createPaymentAccountApi,
  deletePaymentAccountApi,
  deletePaymentAccountChannelApi,
  filterPaymentAccountsApi,
  getPaymentPlatformsApi,
  openPaymentAccountChannelApi,
  setPaymentAccountChannelStatusApi,
  setPaymentAccountStatusApi,
  updatePaymentAccountApi,
  updatePaymentAccountChannelApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import {
  confirmResourceAction,
  runResourceAction,
  useFormModal,
  useResourceGrid,
} from '#/hooks';

import {
  createPaymentAccountModalOptions,
  editPaymentAccountModalOptions,
  editPaymentChannelModalOptions,
  normalizeAlipayCredential,
  normalizeAlipayCredentialPatch,
  normalizePaymentChannelFormData,
  openPaymentChannelModalOptions,
} from '../shared/business-form-schemas';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessStatusOptions,
  formatBusinessTime,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

type SearchValues = {
  accountName?: string;
  externalAccountId?: string;
  platformId?: string;
  status?: BusinessApi.BusinessStatus;
  tenantId?: string;
};
type QueryParams = Omit<BusinessApi.PaymentAccountQuery, 'page'> & {
  pageIndex: number;
};

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const { isMobile } = usePreferences();
const selectedTenantId = ref('');
const platforms = ref<BusinessApi.PaymentPlatform[]>([]);
const selectedAccount = ref<BusinessApi.PaymentAccount>();
const channelDrawerOpen = ref(false);

const platformOptions = computed(() =>
  platforms.value
    .filter(({ status }) => status === 'active')
    .map((platform) => ({ label: platform.name, value: platform.id })),
);

const availableChannelOptions = computed(() => {
  const account = selectedAccount.value;
  if (!account) return [];
  const platform = platforms.value.find(({ id }) => id === account.platformId);
  const opened = new Set(account.channels.map(({ channelId }) => channelId));
  return (platform?.channels ?? [])
    .filter(({ id, status }) => status === 'active' && !opened.has(id))
    .map((channel) => ({
      label: `${channel.name} · ${channel.executionMode === 'BATCH' ? '批量有密' : '商家转账'}`,
      value: channel.id,
    }));
});

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
      componentProps: { placeholder: '请输入支付宝商户号' },
      fieldName: 'externalAccountId',
      label: '支付宝商户号',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        options: platformOptions.value,
        placeholder: '全部平台',
      }),
      fieldName: 'platformId',
      label: '支付平台',
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

const gridOptions: VxeTableGridOptions<BusinessApi.PaymentAccount> = {
  columnConfig: { resizable: true },
  columns: [
    { type: 'seq', width: 60 },
    {
      field: 'name',
      title: '支付账号',
      minWidth: 180,
    },
    {
      field: 'platformId',
      slots: { default: 'platform' },
      title: '支付平台',
      width: 110,
    },
    { field: 'externalAccountId', minWidth: 180, title: '支付宝商户号' },
    {
      field: 'credentialConfigured',
      slots: { default: 'credential' },
      title: '平台凭据',
      width: 110,
    },
    {
      field: 'channels',
      slots: { default: 'channels' },
      title: '已开通通道',
      width: 130,
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
      width: 250,
    },
  ],
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.PaymentAccount,
  SearchValues,
  QueryParams
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
    const result = await filterPaymentAccountsApi({
      ...query,
      page: pageIndex,
      tenantId,
    });
    if (selectedAccount.value) {
      selectedAccount.value = result.items.find(
        ({ id }) => id === selectedAccount.value?.id,
      );
      if (!selectedAccount.value) channelDrawerOpen.value = false;
    }
    return result;
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string) {
  selectedTenantId.value = tenantId;
  channelDrawerOpen.value = false;
  selectedAccount.value = undefined;
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

function openCreate() {
  formModalShow(createPaymentAccountModalOptions(platformOptions.value), {
    onOk: async (api) => {
      await api.validate();
      const data =
        api.formData() as BusinessApi.AlipayPaymentAccountCredential & {
          externalAccountId: string;
          name: string;
          platformId: string;
        };
      await runResourceAction({
        action: () =>
          createPaymentAccountApi({
            credential: normalizeAlipayCredential(data),
            externalAccountId: data.externalAccountId,
            name: data.name,
            platformId: data.platformId,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '支付账号已创建',
      });
    },
  });
}

async function editAccount(account: BusinessApi.PaymentAccount) {
  const mode = account.credentialAuthMode ?? 'KEY';
  const [formApi] = await formModalShow(editPaymentAccountModalOptions(mode), {
    onOk: async (api) => {
      await api.validate();
      const data =
        api.formData() as BusinessApi.AlipayPaymentAccountCredential & {
          externalAccountId: string;
          name: string;
        };
      await runResourceAction({
        action: () =>
          updatePaymentAccountApi(account.id, {
            credential: normalizeAlipayCredentialPatch(data),
            externalAccountId: data.externalAccountId,
            name: data.name,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gridApi.query();
        },
        successMessage: '支付账号已更新',
      });
    },
  });
  formApi?.setValue({
    appId: account.credentialAppId ?? '',
    authMode: mode,
    externalAccountId: account.externalAccountId,
    gateway:
      account.credentialGateway ?? 'https://openapi.alipay.com/gateway.do',
    name: account.name,
  });
}

function changeAccountStatus(
  account: BusinessApi.PaymentAccount,
  checked: boolean,
) {
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setPaymentAccountStatusApi(account.id, status, selectedTenantId.value),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '支付账号已启用' : '支付账号已停用',
  });
}

function removeAccount(account: BusinessApi.PaymentAccount) {
  confirmResourceAction({
    action: () => deletePaymentAccountApi(account.id, selectedTenantId.value),
    content: '已被支付方案、支付订单或支付批次使用的账号不能删除，只能停用。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: () => gridApi.query(),
    successMessage: '支付账号已删除',
    title: `确认删除“${account.name}”吗？`,
  });
}

function openChannelDrawer(account: BusinessApi.PaymentAccount) {
  selectedAccount.value = account;
  channelDrawerOpen.value = true;
}

function openChannel() {
  const account = selectedAccount.value;
  if (!account) return;
  formModalShow(
    openPaymentChannelModalOptions(account.name, availableChannelOptions.value),
    {
      onOk: async (api) => {
        await api.validate();
        const data = cleanOptionalStrings(
          api.formData() as BusinessApi.PaymentAccountChannelInput & {
            channelId: string;
          },
        );
        await runResourceAction({
          action: () =>
            openPaymentAccountChannelApi(account.id, {
              ...data,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '支付通道已开通',
        });
      },
    },
  );
}

async function editChannel(channel: BusinessApi.PaymentChannelBinding) {
  const account = selectedAccount.value;
  if (!account) return;
  const [formApi] = await formModalShow(
    editPaymentChannelModalOptions(channel.channelName ?? '未知支付通道'),
    {
      onOk: async (api) => {
        await api.validate();
        const { channelName: _channelName, ...rawData } =
          api.formData() as BusinessApi.PaymentAccountChannelInput & {
            channelName: string;
          };
        const data = normalizePaymentChannelFormData(rawData);
        await runResourceAction({
          action: () =>
            updatePaymentAccountChannelApi(account.id, channel.id, {
              ...data,
              tenantId: selectedTenantId.value,
            }),
          onSuccess: async () => {
            formModalClose();
            await gridApi.query();
          },
          successMessage: '支付通道参数已更新',
        });
      },
    },
  );
  formApi?.setValue({
    channelName: channel.channelName ?? '未知支付通道',
    maximumAmount: channel.maximumAmount ?? '',
    minimumAmount: channel.minimumAmount ?? '',
  });
}

function changeChannelStatus(
  channel: BusinessApi.PaymentChannelBinding,
  checked: boolean,
) {
  const account = selectedAccount.value;
  if (!account) return;
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setPaymentAccountChannelStatusApi(
        account.id,
        channel.id,
        status,
        selectedTenantId.value,
      ),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '支付通道已启用' : '支付通道已停用',
  });
}

function removeChannel(channel: BusinessApi.PaymentChannelBinding) {
  const account = selectedAccount.value;
  if (!account) return;
  confirmResourceAction({
    action: () =>
      deletePaymentAccountChannelApi(
        account.id,
        channel.id,
        selectedTenantId.value,
      ),
    content: '已被支付方案、支付订单或支付批次使用的通道不能移除，只能停用。',
    okButtonProps: { danger: true },
    okText: '移除',
    onSuccess: () => gridApi.query(),
    successMessage: '支付通道已移除',
    title: `确认移除“${channel.channelName ?? '未知支付通道'}”吗？`,
  });
}

function platformName(id: string) {
  return (
    platforms.value.find((platform) => platform.id === id)?.name ??
    '未知支付平台'
  );
}

function executionModeText(mode: BusinessApi.PaymentExecutionMode | null) {
  if (mode === 'BATCH') return '批量有密';
  if (mode === 'INSTANT') return '商家转账';
  return '-';
}

function amountRangeText(channel: BusinessApi.PaymentChannelBinding) {
  if (!channel.minimumAmount && !channel.maximumAmount) return '不限';
  return `${channel.minimumAmount ?? '不限'} 至 ${channel.maximumAmount ?? '不限'}`;
}

onMounted(async () => {
  [platforms.value, selectedTenantId.value] = await Promise.all([
    getPaymentPlatformsApi(),
    loadTenantOptions(),
  ]);
  if (!selectedTenantId.value) return;
  await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['payment:account:create']"
          :disabled="!selectedTenantId || platformOptions.length === 0"
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增支付账号
        </AButton>
      </template>
      <template #platform="{ row }">
        {{ platformName(row.platformId) }}
      </template>
      <template #credential="{ row }">
        <ATag :color="row.credentialConfigured ? 'success' : 'warning'">
          {{
            row.credentialConfigured
              ? row.credentialAuthMode === 'CERT'
                ? '证书模式'
                : row.credentialAuthMode === 'KEY'
                  ? '公钥模式'
                  : '已配置'
              : '未配置'
          }}
        </ATag>
      </template>
      <template #channels="{ row }">
        <AButton size="small" type="link" @click="openChannelDrawer(row)">
          {{ row.channels.length }} 个通道
        </AButton>
      </template>
      <template #status="{ row }">
        <AsyncStatusSwitch
          v-access:code="['payment:account:update']"
          :checked="row.status === 'active'"
          :label="`${row.name}状态`"
          :request="(checked) => changeAccountStatus(row, checked)"
        />
      </template>
      <template #action="{ row }">
        <div
          class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
        >
          <AButton
            class="px-1"
            size="small"
            type="link"
            @click="openChannelDrawer(row)"
          >
            通道配置
          </AButton>
          <AButton
            v-access:code="['payment:account:update']"
            class="px-1"
            size="small"
            type="link"
            @click="editAccount(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['payment:account:delete']"
            class="px-1"
            danger
            size="small"
            type="link"
            @click="removeAccount(row)"
          >
            删除
          </AButton>
        </div>
      </template>
    </Grid>

    <ADrawer
      v-model:open="channelDrawerOpen"
      :title="
        !isMobile && selectedAccount
          ? `${selectedAccount.name} · 通道配置`
          : '通道配置'
      "
      :width="isMobile ? '100%' : 860"
    >
      <div v-if="isMobile && selectedAccount" class="mb-3 font-medium">
        {{ selectedAccount.name }}
      </div>
      <div class="mb-3 flex justify-end">
        <AButton
          v-access:code="['payment:account:bind']"
          :disabled="
            selectedAccount?.status !== 'active' ||
            availableChannelOptions.length === 0
          "
          size="small"
          type="primary"
          @click="openChannel"
        >
          开通支付通道
        </AButton>
      </div>
      <AAlert
        v-if="selectedAccount?.channels.length === 0"
        class="mb-3"
        message="当前账号尚未开通支付通道"
        show-icon
        type="info"
      />
      <ATable
        v-if="!isMobile"
        data-testid="payment-channel-table"
        :data-source="selectedAccount?.channels ?? []"
        :pagination="false"
        :scroll="{ x: 760 }"
        row-key="id"
        size="small"
      >
        <ATableColumn key="channel" title="支付通道" :width="180">
          <template #default="{ record }">
            {{ record.channelName ?? '未知支付通道' }}
          </template>
        </ATableColumn>
        <ATableColumn key="mode" title="支付方式" :width="110">
          <template #default="{ record }">
            {{ executionModeText(record.executionMode) }}
          </template>
        </ATableColumn>
        <ATableColumn key="amount" title="单笔金额范围" :width="180">
          <template #default="{ record }">
            {{ amountRangeText(record) }}
          </template>
        </ATableColumn>
        <ATableColumn key="status" title="状态" :width="90">
          <template #default="{ record }">
            <AsyncStatusSwitch
              v-access:code="['payment:account:bind']"
              :checked="record.status === 'active'"
              :label="`${record.channelName ?? '支付通道'}状态`"
              :request="(checked) => changeChannelStatus(record, checked)"
            />
          </template>
        </ATableColumn>
        <ATableColumn align="center" key="action" title="操作" :width="150">
          <template #default="{ record }">
            <div
              class="flex w-full flex-nowrap items-center justify-center gap-1 px-1"
            >
              <AButton
                v-access:code="['payment:account:bind']"
                class="px-1"
                size="small"
                type="link"
                @click="editChannel(record)"
              >
                编辑
              </AButton>
              <AButton
                v-access:code="['payment:account:bind']"
                class="px-1"
                danger
                size="small"
                type="link"
                @click="removeChannel(record)"
              >
                移除
              </AButton>
            </div>
          </template>
        </ATableColumn>
      </ATable>
      <div v-else data-testid="payment-channel-mobile-list" class="space-y-3">
        <div
          v-for="channel in selectedAccount?.channels ?? []"
          :key="channel.id"
          class="border-border rounded border p-3"
        >
          <div class="mb-3 flex items-start justify-between gap-3">
            <span class="min-w-0 break-words font-medium">
              {{ channel.channelName ?? '未知支付通道' }}
            </span>
            <AsyncStatusSwitch
              v-access:code="['payment:account:bind']"
              :checked="channel.status === 'active'"
              class="shrink-0"
              :label="`${channel.channelName ?? '支付通道'}状态`"
              :request="(checked) => changeChannelStatus(channel, checked)"
            />
          </div>
          <dl
            class="grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-2 text-sm"
          >
            <dt class="text-muted-foreground">支付方式</dt>
            <dd>{{ executionModeText(channel.executionMode) }}</dd>
            <dt class="text-muted-foreground">单笔金额</dt>
            <dd class="break-words tabular-nums">
              {{ amountRangeText(channel) }}
            </dd>
          </dl>
          <div class="mt-3 flex flex-wrap justify-end gap-2 border-t pt-3">
            <AButton
              v-access:code="['payment:account:bind']"
              size="small"
              @click="editChannel(channel)"
            >
              编辑
            </AButton>
            <AButton
              v-access:code="['payment:account:bind']"
              danger
              size="small"
              @click="removeChannel(channel)"
            >
              移除
            </AButton>
          </div>
        </div>
      </div>
    </ADrawer>
    <FormModalRender />
  </Page>
</template>
