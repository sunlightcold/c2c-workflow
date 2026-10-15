<script setup lang="ts">
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi, MerchantAdsApi } from '#/api';

import { onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { DownOutlined } from '@ant-design/icons-vue';

import {
  executeMerchantAdApi,
  getMerchantAdApi,
  getMerchantAdsApi,
  previewMerchantAdApi,
  setMerchantAdAutomationApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import { runResourceAction, useResourceGrid } from '#/hooks';

import { adPriceText, adStatusLabels } from '../shared/ad-ui';
import AdRunDetail from '../shared/AdRunDetail.vue';
import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  formatBusinessTime,
  merchantPlatformOptions,
  merchantPlatformText,
} from '../shared/business-ui';
import { useAdMerchantFilter } from '../shared/use-ad-merchant-filter';
import AdRuleForm from './AdRuleForm.vue';
import AdSyncModal from './AdSyncModal.vue';

type SearchValues = {
  merchantId?: string;
  platform?: BusinessApi.MerchantPlatform;
  tenantId?: string;
};
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };

const { hasAccessByCodes } = useAccess();
const {
  fixedTenantId,
  loadMerchants,
  loadTenantOptions,
  merchantOptions,
  selectedTenantId,
  tenantOptions,
} = useAdMerchantFilter();
const syncOpen = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const selectedAd = ref<MerchantAdsApi.Ad>();
const runOpen = ref(false);
const run = ref<MerchantAdsApi.Run>();
const runningId = ref<string>();

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
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        'aria-label': '选择广告商家账号',
        options: merchantOptions,
        placeholder: '全部商家',
        showSearch: true,
      }),
      fieldName: 'merchantId',
      label: '商家账号',
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
  ],
  wrapperClass: 'xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};
const gridOptions: VxeTableGridOptions<MerchantAdsApi.Ad> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'merchantName', title: '商家账号', width: 220 },
    {
      field: 'platform',
      formatter: ({ cellValue }) => merchantPlatformText(cellValue),
      title: '交易平台',
      width: 100,
    },
    { field: 'platformAdId', title: '平台广告号', width: 225 },
    { field: 'asset', title: '币种', width: 85 },
    { field: 'fiatCurrency', title: '法币', width: 85 },
    {
      align: 'right',
      field: 'price',
      formatter: ({ cellValue }) => adPriceText(cellValue),
      title: '当前价格',
      width: 120,
    },
    {
      field: 'status',
      formatter: ({ cellValue }) =>
        adStatusLabels[cellValue as MerchantAdsApi.AdStatus],
      title: '平台状态',
      width: 100,
    },
    { field: 'rule', slots: { default: 'rule' }, title: '策略', width: 110 },
    {
      field: 'pricing',
      showOverflow: false,
      slots: { default: 'pricing' },
      title: '调价关系',
      width: 200,
    },
    {
      align: 'center',
      field: 'enabled',
      slots: { default: 'automation' },
      title: '自动调价',
      width: 120,
    },
    {
      field: 'lastSyncedAt',
      formatter: ({ cellValue }) => formatBusinessTime(cellValue),
      title: '同步时间',
      width: 180,
    },
    { field: 'lastError', minWidth: 220, title: '异常原因' },
    {
      align: 'center',
      field: 'action',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 160,
    },
  ],
};
const [Grid, gridApi] = useResourceGrid<
  MerchantAdsApi.Ad,
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
  query: (params) => {
    const tenantId = params.tenantId ?? selectedTenantId.value;
    return tenantId
      ? getMerchantAdsApi({
          tenantId,
          merchantId: params.merchantId,
          platform: params.platform,
          page: params.pageIndex,
          pageSize: params.pageSize,
        })
      : Promise.resolve(
          createEmptyBusinessPage(params.pageIndex, params.pageSize),
        );
  },
});

async function selectTenant(tenantId: string) {
  await gridApi.formApi.setFieldValue('merchantId', undefined);
  await loadMerchants(tenantId);
  await gridApi.query();
}

async function openDetail(ad: MerchantAdsApi.Ad) {
  selectedAd.value = undefined;
  detailOpen.value = true;
  detailLoading.value = true;
  try {
    selectedAd.value = await getMerchantAdApi(ad.id, {
      merchantId: ad.merchantId,
      tenantId: ad.tenantId,
    });
  } finally {
    detailLoading.value = false;
  }
}

async function ruleSaved(ad: MerchantAdsApi.Ad) {
  selectedAd.value = ad;
  await gridApi.query();
}

function openMain(ad: MerchantAdsApi.Ad) {
  if (ad.pricing.role !== 'LINKED') return;
  return openDetail({ ...ad, id: ad.pricing.mainAd.id });
}

function getActionPopupContainer() {
  return window.document.body;
}

function changeAutomation(ad: MerchantAdsApi.Ad, enabled: boolean) {
  return runResourceAction({
    action: () =>
      setMerchantAdAutomationApi(ad.id, {
        enabled,
        merchantId: ad.merchantId,
        tenantId: ad.tenantId,
      }),
    onSuccess: () => gridApi.query(),
    successMessage: enabled
      ? '自动调价已开启'
      : '自动调价已暂停；平台广告状态不变',
  });
}

async function calculate(ad: MerchantAdsApi.Ad, preview: boolean) {
  runningId.value = ad.id;
  try {
    const scope = { merchantId: ad.merchantId, tenantId: ad.tenantId };
    run.value = await (preview
      ? previewMerchantAdApi(ad.id, scope)
      : executeMerchantAdApi(ad.id, scope));
    runOpen.value = true;
    await gridApi.query();
  } finally {
    runningId.value = undefined;
  }
}

onMounted(async () => {
  const tenantId = await loadTenantOptions();
  if (!tenantId) return;
  await gridApi.formApi.setFieldValue('tenantId', tenantId);
  await loadMerchants(tenantId);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['merchant:ad:sync']"
          size="small"
          type="primary"
          @click="syncOpen = true"
        >
          同步广告
        </AButton>
      </template>
      <template #rule="{ row }">
        {{
          row.pricing.role === 'LINKED'
            ? '跟随主广告'
            : row.rule
              ? row.rule.mode === 'FIXED'
                ? '普通跟价'
                : '动态跟价'
              : '未配置'
        }}
      </template>
      <template #pricing="{ row }">
        <div class="flex items-center gap-2 whitespace-nowrap">
          <template v-if="row.pricing.role === 'LINKED'">
            <ATag class="!m-0" color="blue">副广告</ATag>
            <button
              type="button"
              class="text-primary text-xs hover:underline"
              :title="row.pricing.mainAd.platformAdId"
              @click="openMain(row)"
            >
              查看主广告
            </button>
          </template>
          <template v-else-if="row.pricing.role === 'MAIN'">
            <ATag class="!m-0" color="green">主广告</ATag>
            <button
              type="button"
              class="text-primary text-xs hover:underline"
              :title="row.pricing.linkedAd.platformAdId"
              @click="openDetail({ ...row, id: row.pricing.linkedAd.id })"
            >
              查看副广告
            </button>
          </template>
          <ATag v-else class="!m-0">独立广告</ATag>
        </div>
      </template>
      <template #automation="{ row }">
        <div class="flex items-center justify-center gap-1">
          <ASwitch
            v-if="row.pricing.role === 'LINKED'"
            :aria-label="`${row.platformAdId}自动调价`"
            :checked="row.pricing.mainAd.enabled"
            checked-children="运行"
            unchecked-children="暂停"
            disabled
          />
          <AsyncStatusSwitch
            v-else-if="
              hasAccessByCodes([
                row.enabled ? 'merchant:ad:stop' : 'merchant:ad:start',
              ])
            "
            :checked="row.enabled"
            checked-label="运行"
            :disabled="!row.rule"
            :label="`${row.platformAdId}自动调价`"
            :request="(checked) => changeAutomation(row, checked)"
            unchecked-label="暂停"
          />
          <span v-else>{{ row.enabled ? '运行' : '暂停' }}</span>
          <ATooltip
            v-if="row.pendingRunId"
            title="调价结果待核实，系统将继续回查"
          >
            <span
              aria-label="调价结果待核实"
              class="bg-warning size-1.5 rounded-full"
            ></span>
          </ATooltip>
        </div>
      </template>
      <template #action="{ row }">
        <ASpace size="small" class="whitespace-nowrap">
          <template v-if="row.pricing.role === 'LINKED'">
            <AButton
              v-access:code="['merchant:ad:read']"
              aria-label="联动"
              size="small"
              @click="openDetail(row)"
            >
              联动
            </AButton>
            <AButton
              v-access:code="['merchant:ad:read']"
              size="small"
              @click="openMain(row)"
            >
              主广告
            </AButton>
          </template>
          <template v-else>
            <AButton
              v-access:code="['merchant:ad:read']"
              aria-label="策略"
              size="small"
              @click="openDetail(row)"
            >
              策略
            </AButton>
            <ADropdown
              v-if="
                hasAccessByCodes(['merchant:ad:preview']) ||
                hasAccessByCodes(['merchant:ad:execute'])
              "
              :get-popup-container="getActionPopupContainer"
            >
              <AButton
                size="small"
                type="text"
                :aria-label="`${row.platformAdId}更多操作`"
                :loading="runningId === row.id"
              >
                更多
                <DownOutlined
                  :style="{ fontSize: '12px' }"
                  aria-hidden="true"
                />
              </AButton>
              <template #overlay>
                <AMenu>
                  <AMenuItem
                    v-if="hasAccessByCodes(['merchant:ad:preview'])"
                    key="preview"
                    :disabled="!row.rule"
                    @click="calculate(row, true)"
                  >
                    试算
                  </AMenuItem>
                  <AMenuItem
                    v-if="hasAccessByCodes(['merchant:ad:execute'])"
                    key="execute"
                    :disabled="!row.rule && !row.pendingRunId"
                    @click="calculate(row, false)"
                  >
                    {{ row.pendingRunId ? '核实结果' : '立即调价' }}
                  </AMenuItem>
                </AMenu>
              </template>
            </ADropdown>
          </template>
        </ASpace>
      </template>
    </Grid>
    <AdSyncModal
      v-if="syncOpen"
      v-model:open="syncOpen"
      @synced="gridApi.query()"
    />
    <ADrawer
      v-model:open="detailOpen"
      title="买 USDT 广告策略"
      width="min(760px, 94vw)"
    >
      <ASpin :spinning="detailLoading">
        <template v-if="selectedAd">
          <p class="mb-4">
            {{ selectedAd.merchantName }} · {{ selectedAd.platformAdId }} ·
            当前价 {{ adPriceText(selectedAd.price) }}
            {{ selectedAd.fiatCurrency }}/USDT
          </p>
          <template v-if="selectedAd.pricing.role === 'LINKED'">
            <AAlert
              class="mb-4"
              message="副广告由主广告联动调价，不能单独配置或启动。"
              type="info"
              show-icon
            />
            <ADescriptions :column="1" bordered>
              <ADescriptionsItem label="主广告">
                <AButton type="link" @click="openMain(selectedAd)">
                  {{ selectedAd.pricing.mainAd.platformAdId }}
                </AButton>
              </ADescriptionsItem>
              <ADescriptionsItem label="主广告自动调价">
                {{ selectedAd.pricing.mainAd.enabled ? '运行' : '暂停' }}
              </ADescriptionsItem>
              <ADescriptionsItem label="副广告折扣系数">
                {{ selectedAd.pricing.discount }}
              </ADescriptionsItem>
              <ADescriptionsItem label="报价方式">
                主广告价格 × (1 −
                {{ selectedAd.pricing.discount }})，向下保留两位小数
              </ADescriptionsItem>
            </ADescriptions>
            <AButton class="mt-4" type="primary" @click="openMain(selectedAd)">
              管理主广告
            </AButton>
          </template>
          <AdRuleForm
            v-else
            :key="`${selectedAd.id}:${selectedAd.ruleVersion}`"
            :ad="selectedAd"
            @saved="ruleSaved"
          />
        </template>
      </ASpin>
    </ADrawer>
    <ADrawer
      v-model:open="runOpen"
      title="本轮调价结果"
      width="min(820px, 94vw)"
    >
      <AdRunDetail v-if="run" :run="run" />
    </ADrawer>
  </Page>
</template>
