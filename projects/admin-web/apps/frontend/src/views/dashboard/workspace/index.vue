<script lang="ts" setup>
import type { DashboardApi } from '#/api';

import { computed, onMounted, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { useMediaQuery } from '@vueuse/core';

import { getDashboardOverviewApi } from '#/api';
import { formatCny } from '#/utils/decimal';

import { merchantPlatformText } from '../../business/shared/business-ui';
import { useBusinessTenantFilter } from '../../business/shared/use-business-tenant-filter';
import DashboardChart from './dashboard-chart.vue';
import {
  buildBatchOption,
  buildPlatformOption,
  buildSourceOption,
  buildStatusOption,
  buildTrendOption,
} from './dashboard-charts';

type DashboardRange = 7 | 14 | 30;

const rangeOptions = [
  { label: '近 7 天', value: 7 },
  { label: '近 14 天', value: 14 },
  { label: '近 30 天', value: 30 },
];
const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const selectedDays = ref<DashboardRange>(14);
const overview = ref<DashboardApi.Overview>();
const loading = ref(false);
const errorMessage = ref('');
const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
let requestSequence = 0;

const summary = computed(() => overview.value?.summary ?? emptySummary());
const hasTrend = computed(
  () =>
    overview.value?.dailyTrend.some(
      ({ merchantOrderCount, paymentCount }) =>
        merchantOrderCount > 0 || paymentCount > 0,
    ) ?? false,
);
const kpis = computed(() => [
  {
    detail: `${formatCount(summary.value?.paymentSuccessCount)} 笔成功`,
    icon: 'lucide:badge-check',
    label: '成功支付金额',
    tone: 'emerald',
    value: formatMoney(summary.value?.paymentSuccessAmount),
  },
  {
    detail: `${formatCount(summary.value?.paymentCount)} 笔支付订单`,
    icon: 'lucide:circle-percent',
    label: '支付成功率',
    tone: 'blue',
    value: `${summary.value?.paymentSuccessRate ?? '0.00'}%`,
  },
  {
    detail: `${formatCount(summary.value?.merchantOrderCount)} 笔商家订单`,
    icon: 'lucide:landmark',
    label: '商家订单金额',
    tone: 'cyan',
    value: formatMoney(summary.value?.merchantOrderAmount),
  },
  {
    detail: `${formatCount(summary.value?.paymentProcessingCount)} 笔处理中`,
    icon: 'lucide:triangle-alert',
    label: '风险支付订单',
    tone: 'red',
    value: formatCount(summary.value?.paymentExceptionCount),
  },
]);
const operations = computed(() => [
  { label: '活跃商家', value: formatCount(summary.value?.activeMerchantCount) },
  {
    label: '自动支付商家',
    value: formatCount(summary.value?.automatedMerchantCount),
  },
  {
    label: '待支付订单',
    value: formatCount(summary.value?.pendingPaymentCount),
  },
  {
    label: '待放币订单',
    value: formatCount(summary.value?.pendingReleaseCount),
  },
  { label: '运行中机器人', value: formatCount(summary.value?.activeBotCount) },
  { label: '已绑定群组', value: formatCount(summary.value?.activeGroupCount) },
]);
const animateCharts = computed(() => !prefersReducedMotion.value);
const trendOption = computed(() =>
  buildTrendOption(overview.value?.dailyTrend ?? [], animateCharts.value),
);
const statusOption = computed(() =>
  buildStatusOption(overview.value?.paymentStatuses ?? [], animateCharts.value),
);
const sourceOption = computed(() =>
  buildSourceOption(overview.value?.paymentSources ?? [], animateCharts.value),
);
const platformOption = computed(() =>
  buildPlatformOption(overview.value?.platforms ?? [], animateCharts.value),
);
const batchOption = computed(() =>
  buildBatchOption(
    overview.value?.summary ?? emptySummary(),
    animateCharts.value,
  ),
);

async function loadOverview() {
  if (!selectedTenantId.value) return;
  const currentRequest = ++requestSequence;
  loading.value = true;
  errorMessage.value = '';
  try {
    const result = await getDashboardOverviewApi({
      days: selectedDays.value,
      tenantId: selectedTenantId.value,
    });
    if (currentRequest === requestSequence) overview.value = result;
  } catch (error) {
    if (currentRequest === requestSequence) {
      errorMessage.value =
        error instanceof Error ? error.message : '工作台数据加载失败';
    }
  } finally {
    if (currentRequest === requestSequence) loading.value = false;
  }
}

function handleTenantChange(value: unknown) {
  if (typeof value !== 'string') return;
  selectedTenantId.value = value;
  overview.value = undefined;
  void loadOverview();
}

function handleRangeChange(value: number | string) {
  const days = Number(value);
  if (![7, 14, 30].includes(days)) return;
  selectedDays.value = days as DashboardRange;
  void loadOverview();
}

function formatMoney(value?: string) {
  return formatCny(value);
}

function formatCount(value?: number) {
  return new Intl.NumberFormat('zh-CN').format(value ?? 0);
}

function emptySummary(): DashboardApi.Summary {
  return {
    activeBotCount: 0,
    activeGroupCount: 0,
    activeMerchantCount: 0,
    automatedMerchantCount: 0,
    batchCount: 0,
    batchExceptionCount: 0,
    batchProcessingCount: 0,
    batchSuccessCount: 0,
    merchantOrderAmount: '0.00',
    merchantOrderCount: 0,
    pendingPaymentCount: 0,
    pendingReleaseCount: 0,
    paymentAmount: '0.00',
    paymentCount: 0,
    paymentExceptionCount: 0,
    paymentProcessingCount: 0,
    paymentSuccessAmount: '0.00',
    paymentSuccessCount: 0,
    paymentSuccessRate: '0.00',
  };
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (selectedTenantId.value) await loadOverview();
});
</script>

<template>
  <Page>
    <main class="w-full">
      <header
        aria-label="报表筛选"
        class="border-border mb-3 flex justify-end border-b pb-3"
      >
        <div
          class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center"
        >
          <label
            class="text-foreground text-sm font-medium"
            for="dashboard-tenant"
          >
            所属单位
          </label>
          <ASelect
            id="dashboard-tenant"
            :disabled="Boolean(fixedTenantId)"
            :options="tenantOptions"
            :value="selectedTenantId"
            class="w-full sm:w-56"
            placeholder="选择所属单位"
            @change="handleTenantChange"
          />
          <ASegmented
            :options="rangeOptions"
            :value="selectedDays"
            aria-label="统计时间范围"
            @change="handleRangeChange"
          />
          <ATooltip title="刷新数据">
            <AButton
              :loading="loading"
              aria-label="刷新工作台数据"
              class="shrink-0"
              shape="circle"
              @click="loadOverview"
            >
              <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
            </AButton>
          </ATooltip>
        </div>
      </header>

      <AAlert
        v-if="errorMessage"
        class="mb-4"
        :description="errorMessage"
        message="工作台数据加载失败"
        show-icon
        type="error"
      >
        <template #action>
          <AButton size="small" @click="loadOverview">重新加载</AButton>
        </template>
      </AAlert>

      <div
        v-if="loading && !overview"
        class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <div
          v-for="index in 4"
          :key="index"
          class="border-border bg-card min-h-32 rounded-md border p-4"
        >
          <ASkeleton :paragraph="{ rows: 2 }" active />
        </div>
      </div>

      <template v-else-if="overview">
        <section
          aria-label="核心经营指标"
          class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <article
            v-for="metric in kpis"
            :key="metric.label"
            class="border-border bg-card min-w-0 rounded-md border p-4 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="text-muted-foreground text-sm">{{ metric.label }}</p>
                <p
                  class="text-foreground mt-2 truncate text-2xl font-semibold tabular-nums"
                >
                  {{ metric.value }}
                </p>
                <p class="text-muted-foreground mt-2 text-xs tabular-nums">
                  {{ metric.detail }}
                </p>
              </div>
              <span
                :class="`metric-icon metric-icon--${metric.tone}`"
                aria-hidden="true"
              >
                <IconifyIcon :icon="metric.icon" class="size-5" />
              </span>
            </div>
          </article>
        </section>

        <section
          aria-label="运行概况"
          class="border-border my-4 grid grid-cols-2 border-y py-3 sm:grid-cols-3 xl:grid-cols-6"
        >
          <div
            v-for="item in operations"
            :key="item.label"
            class="border-border px-3 py-2 xl:border-r xl:last:border-r-0"
          >
            <p class="text-muted-foreground text-xs">{{ item.label }}</p>
            <p class="text-foreground mt-1 text-lg font-semibold tabular-nums">
              {{ item.value }}
            </p>
          </div>
        </section>

        <section
          aria-label="经营分析图表"
          class="grid grid-cols-1 gap-3 xl:grid-cols-12"
        >
          <article
            class="border-border bg-card rounded-md border p-4 xl:col-span-8"
          >
            <div class="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 class="text-foreground text-base font-semibold">
                  经营与支付趋势
                </h2>
                <p class="text-muted-foreground mt-1 text-xs">
                  订单按业务日期汇总，金额单位为人民币
                </p>
              </div>
              <IconifyIcon
                icon="lucide:chart-no-axes-combined"
                class="text-primary size-5"
                aria-hidden="true"
              />
            </div>
            <DashboardChart
              v-if="hasTrend"
              description="经营与支付趋势图"
              height="320px"
              :options="trendOption"
            />
            <AEmpty v-else class="py-16" description="当前时间范围内暂无订单" />
          </article>

          <article
            class="border-border bg-card rounded-md border p-4 xl:col-span-4"
          >
            <div class="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 class="text-foreground text-base font-semibold">
                  支付状态分布
                </h2>
                <p class="text-muted-foreground mt-1 text-xs">
                  共 {{ formatCount(summary.paymentCount) }} 笔支付订单
                </p>
              </div>
              <IconifyIcon
                icon="lucide:list-filter"
                class="text-primary size-5"
                aria-hidden="true"
              />
            </div>
            <DashboardChart
              v-if="overview.paymentStatuses.length > 0"
              description="支付状态分布图"
              height="320px"
              :options="statusOption"
            />
            <AEmpty v-else class="py-16" description="暂无支付状态数据" />
          </article>

          <article
            class="border-border bg-card rounded-md border p-4 xl:col-span-4"
          >
            <div class="mb-2">
              <h2 class="text-foreground text-base font-semibold">
                订单来源结构
              </h2>
              <p class="text-muted-foreground mt-1 text-xs">
                支付订单按业务来源统计
              </p>
            </div>
            <DashboardChart
              v-if="overview.paymentSources.length > 0"
              description="支付订单来源结构图"
              height="280px"
              :options="sourceOption"
            />
            <AEmpty v-else class="py-12" description="暂无订单来源数据" />
          </article>

          <article
            class="border-border bg-card rounded-md border p-4 xl:col-span-4"
          >
            <div class="mb-2">
              <h2 class="text-foreground text-base font-semibold">
                交易平台对比
              </h2>
              <p class="text-muted-foreground mt-1 text-xs">
                币安与欧易订单处理情况
              </p>
            </div>
            <DashboardChart
              v-if="overview.platforms.length > 0"
              description="币安与欧易订单处理对比图"
              height="280px"
              :options="platformOption"
            />
            <AEmpty v-else class="py-12" description="暂无平台订单数据" />
          </article>

          <article
            class="border-border bg-card rounded-md border p-4 xl:col-span-4"
          >
            <div class="mb-2">
              <h2 class="text-foreground text-base font-semibold">
                批次健康度
              </h2>
              <p class="text-muted-foreground mt-1 text-xs">
                共 {{ formatCount(summary.batchCount) }} 个支付批次
              </p>
            </div>
            <DashboardChart
              v-if="summary.batchCount"
              description="支付批次健康度分布图"
              height="280px"
              :options="batchOption"
            />
            <AEmpty v-else class="py-12" description="暂无支付批次数据" />
          </article>
        </section>

        <section
          class="border-border bg-card mt-3 rounded-md border"
          aria-labelledby="ranking-title"
        >
          <div
            class="border-border flex items-center justify-between border-b px-4 py-3"
          >
            <div>
              <h2
                id="ranking-title"
                class="text-foreground text-base font-semibold"
              >
                商家支付排行
              </h2>
              <p class="text-muted-foreground mt-1 text-xs">
                按成功支付金额降序
              </p>
            </div>
            <IconifyIcon
              icon="lucide:ranking"
              class="text-primary size-5"
              aria-hidden="true"
            />
          </div>
          <div
            v-if="overview.merchantRanking.length > 0"
            class="overflow-x-auto"
          >
            <table class="dashboard-ranking-table w-full min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">排名</th>
                  <th scope="col">商家账号</th>
                  <th scope="col">平台</th>
                  <th scope="col">支付订单</th>
                  <th scope="col">成功金额</th>
                  <th scope="col">成功率</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="(merchant, index) in overview.merchantRanking"
                  :key="merchant.merchantId"
                >
                  <td class="font-medium tabular-nums">{{ index + 1 }}</td>
                  <td>
                    <p class="text-foreground max-w-64 truncate font-medium">
                      {{ merchant.merchantName }}
                    </p>
                  </td>
                  <td>
                    <ATag>{{ merchantPlatformText(merchant.platform) }}</ATag>
                  </td>
                  <td class="tabular-nums">
                    {{ formatCount(merchant.successCount) }} /
                    {{ formatCount(merchant.paymentCount) }}
                  </td>
                  <td class="font-medium tabular-nums">
                    {{ formatMoney(merchant.successAmount) }}
                  </td>
                  <td class="min-w-44">
                    <div class="flex items-center gap-3">
                      <AProgress
                        :percent="Number(merchant.successRate)"
                        :show-info="false"
                        class="mb-0 min-w-24"
                        size="small"
                      />
                      <span class="w-14 text-right tabular-nums">
                        {{ merchant.successRate }}%
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <AEmpty v-else class="py-12" description="暂无商家支付排行" />
        </section>
      </template>

      <AEmpty
        v-else-if="!selectedTenantId && !loading"
        class="py-24"
        description="暂无可查看的所属单位"
      />
    </main>
  </Page>
</template>

<style scoped>
.metric-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 6px;
}

.metric-icon--blue {
  color: #2563eb;
  background: color-mix(in srgb, #2563eb 12%, transparent);
}

.metric-icon--cyan {
  color: #0891b2;
  background: color-mix(in srgb, #0891b2 12%, transparent);
}

.metric-icon--emerald {
  color: #059669;
  background: color-mix(in srgb, #059669 12%, transparent);
}

.metric-icon--red {
  color: #dc2626;
  background: color-mix(in srgb, #dc2626 12%, transparent);
}

.dashboard-ranking-table th,
.dashboard-ranking-table td {
  padding: 12px 16px;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
}

.dashboard-ranking-table th {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 45%);
}

.dashboard-ranking-table td {
  font-size: 14px;
  color: hsl(var(--foreground));
}

.dashboard-ranking-table tbody tr:last-child td {
  border-bottom: 0;
}

.dashboard-ranking-table tbody tr:hover td {
  background: hsl(var(--muted) / 30%);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
