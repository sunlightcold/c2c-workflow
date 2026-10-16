<script setup lang="ts">
import type { VbenFormProps } from '#/adapter/form';
import type {
  VxeGridListeners,
  VxeTableGridOptions,
} from '#/adapter/vxe-table';
import type { IpProxy, ProxyQuality, ProxyQuery } from '#/api/business/proxies';

import { onMounted, reactive, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { usePreferences } from '@vben/preferences';

import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  checkProxyQuality,
  deleteProxies,
  deleteProxy,
  getProxyAccounts,
  listProxies,
  testProxy,
} from '#/api/business/proxies';
import { BaseModal } from '#/components/base-modal';
import { confirmResourceAction, useResourceGrid } from '#/hooks';

import { businessModalProps } from '../shared/business-form-layout';
import { createEmptyBusinessPage } from '../shared/business-grid';
import { merchantPlatformText } from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';
import ProxyFormModal from './proxy-form-modal.vue';
import { proxyAddress } from './proxy-format';
import {
  proxyColumns,
  proxyProtocolOptions,
  proxyStatusOptions,
} from './schema';

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const { isMobile } = usePreferences();
const tenantId = ref('');
const selected = ref<string[]>([]);
const batchQuality = ref(false);
const batchTesting = ref(false);
const checking = ref(new Set<string>());
const testing = ref(new Set<string>());
const editing = ref<IpProxy>();
const formOpen = ref(false);
const listError = ref(false);
const listLoading = ref(false);
const accountsLoading = ref(false);
const accountsName = ref('');
const accountsOpen = ref(false);
const accounts = ref<Awaited<ReturnType<typeof getProxyAccounts>>>([]);
const quality = ref<ProxyQuality>();
const qualityName = ref('');
const qualityOpen = ref(false);
const sort = reactive({ sort_by: 'id', sort_order: 'desc' as 'asc' | 'desc' });
const currentQuery = ref<ProxyQuery>({ tenantId: '' });
type SearchValues = {
  protocol?: string;
  search?: string;
  status?: string;
  tenantId?: string;
};

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 80 },
  schema: [
    {
      component: 'Select',
      fieldName: 'tenantId',
      label: '经营单位',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled:
          Boolean(fixedTenantId.value) ||
          listLoading.value ||
          batchTesting.value ||
          batchQuality.value,
        options: tenantOptions,
        placeholder: '请选择经营单位',
        showSearch: true,
        optionFilterProp: 'label',
        onChange: (value: string) => void selectTenant(value),
      }),
    },
    {
      component: 'Input',
      fieldName: 'search',
      label: '名称 / 地址',
      componentProps: { placeholder: '搜索名称或地址', allowClear: true },
    },
    {
      component: 'Select',
      fieldName: 'protocol',
      label: '协议',
      componentProps: {
        options: proxyProtocolOptions,
        placeholder: '全部协议',
        allowClear: true,
      },
    },
    {
      component: 'Select',
      fieldName: 'status',
      label: '状态',
      componentProps: {
        options: proxyStatusOptions,
        placeholder: '全部状态',
        allowClear: true,
      },
    },
  ],
  wrapperClass: 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
};
const gridOptions: VxeTableGridOptions<IpProxy> = {
  columns: proxyColumns(!isMobile.value),
  rowConfig: { keyField: 'id', isHover: true },
  checkboxConfig: { reserve: true, highlight: true },
  sortConfig: { remote: true },
  proxyConfig: { autoLoad: false, sort: false },
  pagerConfig: { pageSize: 20 },
  toolbarConfig: { export: false },
};
const [Grid, gridApi] = useResourceGrid<IpProxy, SearchValues>({
  formOptions,
  gridOptions,
  query: async (params) => {
    const scope = params.tenantId || tenantId.value;
    if (!scope)
      return createEmptyBusinessPage(params.pageIndex, params.pageSize);
    if (tenantId.value && tenantId.value !== scope) clearSelection();
    tenantId.value = scope;
    const query: ProxyQuery = {
      tenantId: scope,
      page: params.pageIndex,
      page_size: params.pageSize,
      search: params.search || undefined,
      protocol: params.protocol || undefined,
      status: params.status || undefined,
      ...sort,
    };
    currentQuery.value = query;
    listLoading.value = true;
    listError.value = false;
    try {
      const result = await listProxies(query);
      return { items: result.items, meta: { totalItems: result.total } };
    } catch (error) {
      listError.value = true;
      throw error;
    } finally {
      listLoading.value = false;
    }
  },
});
const gridEvents: VxeGridListeners<IpProxy> = {
  checkboxChange: syncSelection,
  checkboxAll: syncSelection,
  sortChange: ({ field, order }) => {
    sort.sort_by = order ? (field === 'expires_at' ? 'expiry' : field) : 'id';
    sort.sort_order = order === 'asc' ? 'asc' : 'desc';
    void gridApi.query();
  },
};
watch(isMobile, (mobile) =>
  gridApi.setGridOptions({ columns: proxyColumns(!mobile) }),
);
onMounted(async () => {
  tenantId.value = await loadTenantOptions();
  gridApi.formApi.updateSchema([
    { fieldName: 'tenantId', defaultValue: tenantId.value },
  ]);
  await gridApi.formApi.setFieldValue('tenantId', tenantId.value);
  await gridApi.query();
});
function syncSelection() {
  const records: IpProxy[] = [
    ...gridApi.grid.getCheckboxRecords(),
    ...gridApi.grid.getCheckboxReserveRecords(),
  ];
  selected.value = [...new Set(records.map((row) => row.id))];
}
function clearSelection() {
  gridApi.grid.clearCheckboxRow();
  gridApi.grid.clearCheckboxReserve();
  selected.value = [];
}
async function selectTenant(value: string) {
  tenantId.value = value;
  clearSelection();
  await gridApi.formApi.setFieldValue('tenantId', value);
  gridApi.formApi.setLatestSubmissionValues({
    ...gridApi.formApi.getLatestSubmissionValues(),
    tenantId: value,
  });
  await gridApi.reload();
}
function edit(proxy?: IpProxy) {
  editing.value = proxy;
  formOpen.value = true;
}
async function test(proxy: IpProxy) {
  if (testing.value.has(proxy.id)) return;
  testing.value.add(proxy.id);
  try {
    proxy.last_test = await testProxy(tenantId.value, proxy.id);
  } finally {
    testing.value.delete(proxy.id);
  }
}
async function check(proxy: IpProxy, show = true) {
  if (checking.value.has(proxy.id)) return;
  checking.value.add(proxy.id);
  try {
    proxy.last_quality = await checkProxyQuality(tenantId.value, proxy.id);
    if (show) showQuality(proxy);
  } finally {
    checking.value.delete(proxy.id);
  }
}
function showQuality(proxy: IpProxy) {
  if (!proxy.last_quality) return;
  quality.value = proxy.last_quality;
  qualityName.value = proxy.name;
  qualityOpen.value = true;
}
async function operationTargets() {
  const result: IpProxy[] = [];
  const params = {
    ...currentQuery.value,
    page_size: 1000,
    ...(selected.value.length > 0
      ? { ids: selected.value.join(','), search: '', protocol: '', status: '' }
      : {}),
  };
  for (let current = 1; ; current++) {
    const response = await listProxies({ ...params, page: current });
    result.push(...response.items);
    if (result.length >= response.total || response.items.length === 0)
      return result;
  }
}
async function batch(kind: 'quality' | 'test') {
  const busy = kind === 'test' ? batchTesting : batchQuality;
  if (busy.value) return;
  busy.value = true;
  try {
    const queue = await operationTargets();
    let failed = 0;
    await Promise.all(
      Array.from(
        { length: Math.min(kind === 'test' ? 5 : 3, queue.length) },
        async () => {
          for (let proxy = queue.shift(); proxy; proxy = queue.shift()) {
            try {
              await (kind === 'test' ? test(proxy) : check(proxy, false));
            } catch {
              failed++;
            }
          }
        },
      ),
    );
    await gridApi.query();
    message.info(failed ? `检测结束，${failed} 项请求失败` : '检测完成');
  } finally {
    busy.value = false;
  }
}
function remove(proxy: IpProxy) {
  confirmResourceAction({
    title: `删除代理“${proxy.name}”？`,
    content: '已绑定账号的代理无法删除，请先解绑。',
    okText: '删除',
    okType: 'danger',
    action: () => deleteProxy(tenantId.value, proxy.id),
    onSuccess: async () => {
      clearSelection();
      await gridApi.query();
    },
    successMessage: '代理已删除',
  });
}
function removeSelected() {
  confirmResourceAction({
    title: `删除选中的 ${selected.value.length} 个代理？`,
    content: '已绑定账号的代理将保留。',
    okText: '删除',
    okType: 'danger',
    action: async () => {
      const result = await deleteProxies(tenantId.value, selected.value);
      clearSelection();
      message.info(
        `已删除 ${result.deleted_ids.length} 个，失败 ${result.failed.length} 个`,
      );
    },
    onSuccess: () => gridApi.query(),
  });
}
async function showAccounts(proxy: IpProxy) {
  accountsName.value = proxy.name;
  accounts.value = [];
  accountsOpen.value = true;
  accountsLoading.value = true;
  try {
    accounts.value = await getProxyAccounts(tenantId.value, proxy.id);
  } finally {
    accountsLoading.value = false;
  }
}
function expiry(proxy: IpProxy) {
  if (!proxy.expires_at) return '永不过期';
  if (proxy.status === 'expired') return '已过期';
  const days = dayjs.unix(proxy.expires_at).diff(dayjs(), 'day');
  if (days <= proxy.expiry_warn_days) return `${Math.max(0, days)} 天后到期`;
  return dayjs.unix(proxy.expires_at).format('YYYY-MM-DD');
}
function expiryColor(proxy: IpProxy) {
  if (proxy.status === 'expired') return 'error';
  return proxy.expires_at &&
    dayjs.unix(proxy.expires_at).diff(dayjs(), 'day') <= proxy.expiry_warn_days
    ? 'warning'
    : undefined;
}
</script>

<template>
  <Page auto-content-height>
    <AAlert
      v-if="listError"
      class="mb-3"
      type="error"
      show-icon
      message="代理列表加载失败，请点击表格刷新按钮重试。"
    />
    <Grid :grid-events="gridEvents" class="proxy-resource-grid">
      <template #toolbar-actions>
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <AButton
            v-access:code="['system:proxy:create']"
            size="small"
            type="primary"
            :disabled="!tenantId"
            @click="edit()"
          >
            添加代理
          </AButton>
          <AButton
            v-access:code="['system:proxy:test']"
            size="small"
            :disabled="!tenantId"
            :loading="batchTesting"
            @click="batch('test')"
          >
            连接测试
          </AButton>
          <AButton
            v-access:code="['system:proxy:quality']"
            size="small"
            :disabled="!tenantId"
            :loading="batchQuality"
            @click="batch('quality')"
          >
            批量质量检测
          </AButton>
          <AButton
            v-access:code="['system:proxy:delete']"
            size="small"
            danger
            :disabled="selected.length === 0"
            @click="removeSelected"
          >
            批量删除
          </AButton>
          <span
            v-if="selected.length > 0"
            class="text-muted-foreground text-xs"
            role="status"
          >
            已选 {{ selected.length }} 个
          </span>
          <AButton
            v-if="selected.length > 0"
            size="small"
            type="link"
            @click="clearSelection"
          >
            清空选择
          </AButton>
        </div>
      </template>
      <template #address="{ row }">
        <span class="font-mono">{{ proxyAddress(row) }}</span>
      </template>
      <template #auth="{ row }">
        <span v-if="row.username || row.password_configured">
          {{ row.username }} {{ row.password_configured ? '••••••' : '' }}
        </span>
        <span v-else class="text-muted-foreground">无认证</span>
      </template>
      <template #location="{ row }">
        <div>{{ row.last_test?.country || '—' }}</div>
        <div
          v-if="row.last_test?.ip_address"
          class="text-muted-foreground text-xs"
        >
          {{ row.last_test.ip_address }}
        </div>
      </template>
      <template #accounts="{ row }">
        <AButton
          v-access:code="['merchant:account:read']"
          type="link"
          size="small"
          @click="showAccounts(row)"
        >
          {{ row.account_count }}
        </AButton>
      </template>
      <template #latency="{ row }">
        <div
          :class="{
            'text-destructive': row.last_test && !row.last_test.success,
          }"
        >
          {{
            row.last_test
              ? row.last_test.success
                ? `${row.last_test.latency_ms} ms`
                : '连接失败'
              : '未测试'
          }}
        </div>
        <AButton
          v-if="row.last_quality"
          type="link"
          size="small"
          class="px-0"
          @click="showQuality(row)"
        >
          {{ row.last_quality.grade }} · {{ row.last_quality.score }} 分
        </AButton>
      </template>
      <template #expiry="{ row }">
        <ATag :color="expiryColor(row)">{{ expiry(row) }}</ATag>
      </template>
      <template #actions="{ row }">
        <div class="flex w-full flex-nowrap items-center justify-center gap-1">
          <AButton
            v-access:code="['system:proxy:test']"
            type="link"
            size="small"
            class="px-1"
            :loading="testing.has(row.id)"
            @click="test(row)"
          >
            测试
          </AButton>
          <AButton
            v-access:code="['system:proxy:quality']"
            type="link"
            size="small"
            class="px-1"
            :loading="checking.has(row.id)"
            @click="check(row)"
          >
            质量
          </AButton>
          <AButton
            v-access:code="['system:proxy:update']"
            type="link"
            size="small"
            class="px-1"
            @click="edit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['system:proxy:delete']"
            type="link"
            size="small"
            class="px-1"
            danger
            :disabled="row.account_count > 0"
            @click="remove(row)"
          >
            删除
          </AButton>
        </div>
      </template>
    </Grid>
    <ProxyFormModal
      :open="formOpen"
      :tenant-id="tenantId"
      :proxy="editing"
      @close="formOpen = false"
      @saved="gridApi.query()"
    />
    <BaseModal
      v-model="accountsOpen"
      v-bind="businessModalProps(`${accountsName} · 绑定账号`, 640)"
      :footer="null"
      closable
      keyboard
    >
      <AList
        :data-source="accounts"
        :loading="accountsLoading"
        :locale="{ emptyText: '暂无绑定账号' }"
      >
        <template #renderItem="{ item }">
          <AListItem>
            <AListItemMeta :title="item.name" /><ATag>
              {{ merchantPlatformText(item.platform) }}
            </ATag>
          </AListItem>
        </template>
      </AList>
    </BaseModal>
    <BaseModal
      v-model="qualityOpen"
      v-bind="businessModalProps(`${qualityName} · 质量检测报告`, 760)"
      :footer="null"
      closable
      keyboard
    >
      <template v-if="quality">
        <ADescriptions bordered size="small" :column="1" class="mb-4">
          <ADescriptionsItem label="检测评分">
            {{ quality.grade }} · {{ quality.score }} 分
          </ADescriptionsItem>
          <ADescriptionsItem label="检测结论">
            {{ quality.summary }}
          </ADescriptionsItem>
          <ADescriptionsItem label="检测时间">
            {{ dayjs.unix(quality.checked_at).format('YYYY-MM-DD HH:mm:ss') }}
          </ADescriptionsItem>
        </ADescriptions>
        <AList :data-source="quality.items" size="small">
          <template #renderItem="{ item }">
            <AListItem>
              <div class="w-full min-w-0 space-y-2 break-words">
                <div class="flex flex-wrap items-center gap-2">
                  <strong>{{ item.target }}</strong>
                  <ATag :color="item.status === 'pass' ? 'success' : 'warning'">
                    {{ item.status }}
                  </ATag>
                  <span
                    v-if="item.latency_ms !== undefined"
                    class="text-muted-foreground"
                  >
                    {{ item.latency_ms }} ms
                  </span>
                </div>
                <p>{{ item.message }}</p>
                <p v-if="item.cf_ray" class="text-muted-foreground text-xs">
                  CF-Ray: {{ item.cf_ray }}
                </p>
              </div>
            </AListItem>
          </template>
        </AList>
      </template>
    </BaseModal>
  </Page>
</template>

<style scoped>
.proxy-resource-grid :deep(.vxe-toolbar) {
  flex-wrap: wrap;
  gap: 8px;
}

.proxy-resource-grid :deep(.vxe-buttons--wrapper) {
  min-width: 0;
}
</style>
