<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createPaymentAccountApi,
  getPaymentAccountsApi,
  getPaymentPlatformsApi,
  openPaymentAccountChannelApi,
} from '#/api';
import { runResourceAction, useFormModal, useResourceGrid } from '#/hooks';

import {
  createPaymentAccountModalOptions,
  openPaymentChannelModalOptions,
} from '../shared/business-form-schemas';
import {
  businessStatusText,
  formatBusinessTime,
  toBusinessGridData,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

type SearchValues = { tenantId?: string };
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };

const { fixedTenantId, loadDefaultTenantId, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const platforms = ref<BusinessApi.PaymentPlatform[]>([]);
const selectedAccount = ref<BusinessApi.PaymentAccount>();

const platformOptions = computed(() =>
  platforms.value
    .filter(({ status }) => status === 'active')
    .map((platform) => ({ label: platform.name, value: platform.id })),
);

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
  ],
};

const gridOptions: VxeTableGridOptions<BusinessApi.PaymentAccount> = {
  columns: [
    { type: 'seq', width: 70 },
    { field: 'name', title: '账号名称', minWidth: 170 },
    { field: 'code', title: '账号编码', width: 150 },
    {
      field: 'platformId',
      title: '支付平台',
      width: 120,
      slots: { default: 'platform' },
    },
    { field: 'externalAccountId', title: '商户号', width: 180 },
    {
      field: 'credentialConfigured',
      title: '凭据',
      width: 100,
      slots: { default: 'credential' },
    },
    {
      field: 'channels',
      title: '已开通通道',
      minWidth: 260,
      slots: { default: 'channels' },
    },
    {
      field: 'status',
      title: '状态',
      width: 100,
      slots: { default: 'status' },
    },
    {
      field: 'createdAt',
      title: '创建时间',
      width: 190,
      formatter: ({ cellValue }) => formatBusinessTime(cellValue as string),
    },
    {
      field: 'active',
      title: '操作',
      align: 'center',
      fixed: 'right',
      width: 130,
      slots: { default: 'action' },
    },
  ],
  pagerConfig: { enabled: false },
  toolbarConfig: { search: false },
};

const [Grid, gApi] = useResourceGrid<
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
    selectedTenantId.value = params.tenantId ?? '';
    if (!params.tenantId) return toBusinessGridData([]);
    return toBusinessGridData(
      await getPaymentAccountsApi({ tenantId: params.tenantId }),
    );
  },
});
const { FormModalRender, formModalClose, formModalShow } = useFormModal();

async function selectTenant(tenantId: string) {
  selectedTenantId.value = tenantId;
  await gApi.query();
}

function openCreate() {
  formModalShow(createPaymentAccountModalOptions(platformOptions.value), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as {
        code: string;
        credentialRef: string;
        externalAccountId: string;
        name: string;
        platformId: string;
      };
      await runResourceAction({
        action: () =>
          createPaymentAccountApi({
            ...data,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gApi.query();
        },
        successMessage: '支付账号已创建',
      });
    },
  });
}

function openChannel(account: BusinessApi.PaymentAccount) {
  selectedAccount.value = account;
  const platform = platforms.value.find(({ id }) => id === account.platformId);
  const opened = new Set(account.channels.map(({ channelId }) => channelId));
  const channels = (platform?.channels ?? [])
    .filter(({ id, status }) => status === 'active' && !opened.has(id))
    .map((channel) => ({
      label: `${channel.name} · ${channel.executionMode === 'BATCH' ? '批量有密' : '商家转账'}`,
      value: channel.id,
    }));
  formModalShow(openPaymentChannelModalOptions(account.name, channels), {
    onOk: async (api) => {
      await api.validate();
      const data = api.formData() as { channelId: string; configRef?: string };
      await runResourceAction({
        action: () =>
          openPaymentAccountChannelApi(account.id, {
            channelId: data.channelId,
            configRef: data.configRef || undefined,
            tenantId: selectedTenantId.value,
          }),
        onSuccess: async () => {
          formModalClose();
          await gApi.query();
        },
        successMessage: '支付通道已开通',
      });
    },
  });
}

function platformName(id: string) {
  return platforms.value.find((platform) => platform.id === id)?.name ?? id;
}

onMounted(async () => {
  [platforms.value, selectedTenantId.value] = await Promise.all([
    getPaymentPlatformsApi(),
    loadDefaultTenantId(),
  ]);
  if (!selectedTenantId.value) return;
  await gApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
  await gApi.query();
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
          {{ row.credentialConfigured ? '已配置' : '未配置' }}
        </ATag>
      </template>
      <template #channels="{ row }">
        <ASpace wrap>
          <ATag v-for="channel in row.channels" :key="channel.id">
            {{ channel.channelName || channel.channelCode }}
          </ATag>
          <span v-if="row.channels.length === 0" class="text-muted-foreground">
            未开通
          </span>
        </ASpace>
      </template>
      <template #status="{ row }">
        <ATag :color="row.status === 'active' ? 'success' : 'default'">
          {{ businessStatusText(row.status) }}
        </ATag>
      </template>
      <template #action="{ row }">
        <AButton
          v-access:code="['payment:account:bind']"
          :disabled="row.status !== 'active'"
          size="small"
          type="default"
          @click="openChannel(row)"
        >
          开通通道
        </AButton>
      </template>
    </Grid>
    <FormModalRender />
  </Page>
</template>
