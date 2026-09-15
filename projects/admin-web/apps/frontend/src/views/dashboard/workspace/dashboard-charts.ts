import type { ECOption } from '@vben/plugins/echarts';

import type { DashboardApi } from '#/api';

import {
  businessEnumText,
  merchantPlatformText,
} from '../../business/shared/business-ui';

export const dashboardPalette = {
  amber: '#d97706',
  blue: '#2563eb',
  cyan: '#0891b2',
  emerald: '#059669',
  red: '#dc2626',
  slate: '#64748b',
} as const;

const axis = {
  axisLine: { show: false },
  axisTick: { show: false },
  splitLine: { lineStyle: { color: 'rgba(148, 163, 184, 0.18)' } },
};

function baseOption(ariaLabel: string, animate: boolean): ECOption {
  return {
    animation: animate,
    animationDuration: animate ? 420 : 0,
    aria: { decal: { show: true }, description: ariaLabel, enabled: true },
    color: [
      dashboardPalette.blue,
      dashboardPalette.emerald,
      dashboardPalette.amber,
      dashboardPalette.cyan,
      dashboardPalette.red,
      dashboardPalette.slate,
    ],
    textStyle: { fontFamily: 'inherit' },
  };
}

export function buildTrendOption(
  rows: DashboardApi.DailyTrend[],
  animate = true,
): ECOption {
  return {
    ...baseOption('经营趋势：每日商家订单、支付订单和成功支付金额', animate),
    grid: { bottom: 8, containLabel: true, left: 8, right: 14, top: 52 },
    legend: { itemHeight: 8, itemWidth: 14, top: 4 },
    series: [
      {
        barMaxWidth: 18,
        data: rows.map(({ merchantOrderCount }) => merchantOrderCount),
        emphasis: { focus: 'series' },
        name: '商家订单',
        type: 'bar',
      },
      {
        barMaxWidth: 18,
        data: rows.map(({ paymentCount }) => paymentCount),
        emphasis: { focus: 'series' },
        name: '支付订单',
        type: 'bar',
      },
      {
        data: rows.map(({ paymentSuccessAmount }) =>
          Number(paymentSuccessAmount),
        ),
        lineStyle: { width: 3 },
        name: '成功金额',
        showSymbol: rows.length <= 14,
        smooth: 0.25,
        symbolSize: 7,
        type: 'line',
        yAxisIndex: 1,
      },
    ],
    tooltip: { axisPointer: { type: 'shadow' }, trigger: 'axis' },
    xAxis: {
      ...axis,
      axisLabel: { hideOverlap: true },
      data: rows.map(({ date }) => date.slice(5)),
      type: 'category',
    },
    yAxis: [
      { ...axis, minInterval: 1, name: '订单 / 笔', type: 'value' },
      {
        ...axis,
        axisLabel: { formatter: '¥{value}' },
        name: '金额 / 元',
        splitLine: { show: false },
        type: 'value',
      },
    ],
  };
}

export function buildStatusOption(
  rows: DashboardApi.Distribution[],
  animate = true,
): ECOption {
  const sorted = [...rows].sort((a, b) => a.count - b.count);
  return {
    ...baseOption('支付状态分布：各状态支付订单笔数', animate),
    grid: { bottom: 8, containLabel: true, left: 8, right: 36, top: 12 },
    series: [
      {
        barMaxWidth: 18,
        data: sorted.map(({ count }) => count),
        label: { formatter: '{c} 笔', position: 'right', show: true },
        name: '订单数',
        type: 'bar',
      },
    ],
    tooltip: { axisPointer: { type: 'shadow' }, trigger: 'axis' },
    xAxis: { ...axis, minInterval: 1, name: '笔', type: 'value' },
    yAxis: {
      ...axis,
      axisLabel: { width: 84 },
      data: sorted.map(({ key }) => businessEnumText(key)),
      type: 'category',
    },
  };
}

export function buildSourceOption(
  rows: DashboardApi.Distribution[],
  animate = true,
): ECOption {
  return {
    ...baseOption(
      '订单来源分布：C2C 买币、机器人手工支付和退款订单占比',
      animate,
    ),
    legend: { bottom: 0, itemHeight: 8, itemWidth: 14 },
    series: [
      {
        center: ['50%', '43%'],
        data: rows.map(({ count, key }) => ({
          name: businessEnumText(key),
          value: count,
        })),
        emphasis: { label: { fontWeight: 600, show: true } },
        itemStyle: { borderColor: 'rgba(255,255,255,0.75)', borderWidth: 2 },
        label: { formatter: '{b}\n{d}%', show: true },
        name: '订单来源',
        radius: ['46%', '70%'],
        type: 'pie',
      },
    ],
    tooltip: { trigger: 'item' },
  };
}

export function buildPlatformOption(
  rows: DashboardApi.Platform[],
  animate = true,
): ECOption {
  return {
    ...baseOption('平台经营对比：币安和欧易的已付款与待付款订单数', animate),
    grid: { bottom: 8, containLabel: true, left: 8, right: 12, top: 44 },
    legend: { itemHeight: 8, itemWidth: 14, top: 0 },
    series: [
      {
        barMaxWidth: 24,
        data: rows.map(({ paidCount }) => paidCount),
        name: '已付款',
        type: 'bar',
      },
      {
        barMaxWidth: 24,
        data: rows.map(({ pendingCount }) => pendingCount),
        name: '待付款',
        type: 'bar',
      },
    ],
    tooltip: { axisPointer: { type: 'shadow' }, trigger: 'axis' },
    xAxis: {
      ...axis,
      data: rows.map(({ platform }) => merchantPlatformText(platform)),
      type: 'category',
    },
    yAxis: { ...axis, minInterval: 1, name: '订单 / 笔', type: 'value' },
  };
}

export function buildBatchOption(
  summary: DashboardApi.Summary,
  animate = true,
): ECOption {
  const known =
    summary.batchSuccessCount +
    summary.batchProcessingCount +
    summary.batchExceptionCount;
  const data = [
    { name: '成功', value: summary.batchSuccessCount },
    { name: '处理中', value: summary.batchProcessingCount },
    { name: '异常', value: summary.batchExceptionCount },
    { name: '其他', value: Math.max(0, summary.batchCount - known) },
  ].filter(({ value }) => value > 0);
  return {
    ...baseOption('支付批次健康度：成功、处理中、异常和其他批次数量', animate),
    legend: { bottom: 0, itemHeight: 8, itemWidth: 14 },
    series: [
      {
        center: ['50%', '43%'],
        color: [
          dashboardPalette.emerald,
          dashboardPalette.blue,
          dashboardPalette.red,
          dashboardPalette.slate,
        ],
        data,
        label: { formatter: '{b} {c}', show: true },
        name: '批次状态',
        radius: ['46%', '70%'],
        type: 'pie',
      },
    ],
    tooltip: { trigger: 'item' },
  };
}
