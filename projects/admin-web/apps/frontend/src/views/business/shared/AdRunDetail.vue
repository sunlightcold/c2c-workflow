<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { MerchantAdsApi } from '#/api';

import {
  adPaymentMethodText,
  adPriceText,
  adRunStatusColors,
  adRunStatusLabels,
  adRunTriggerLabels,
} from './ad-ui';
import { formatBusinessTime, merchantPlatformText } from './business-ui';

defineProps<{ run: MerchantAdsApi.Run }>();

const candidateColumns: TableColumnsType<
  MerchantAdsApi.Evidence['candidates'][number]
> = [
  { dataIndex: ['quote', 'traderNickname'], title: '同行' },
  {
    customRender: ({ text }) => adPriceText(text),
    dataIndex: ['quote', 'price'],
    title: '同行收币价',
  },
  {
    customRender: ({ text }) => adPriceText(text),
    dataIndex: 'targetPrice',
    title: '高一格后的价格',
  },
  { dataIndex: 'reason', title: '取舍原因' },
  {
    title: '未活跃时间',
    customRender: ({ record }) =>
      record.quote.activeSeconds === null ||
      record.quote.activeSeconds === undefined
        ? '未提供'
        : `${record.quote.activeSeconds} 秒`,
  },
];

function queryText(query: MerchantAdsApi.MarketQuery) {
  return [
    `${query.asset}/${query.fiatCurrency}`,
    query.amount === '0' ? '金额不限' : `金额 ${query.amount}`,
    query.paymentMethods.length > 0
      ? query.paymentMethods
          .map((method) => adPaymentMethodText(method))
          .join('、')
      : '支付方式不限',
    query.merchantOnly ? '只看商家' : '不限商家类型',
    query.periodMinutes === null ? '时限不限' : `${query.periodMinutes} 分钟`,
  ].join(' · ');
}
</script>

<template>
  <AAlert
    class="mb-4"
    :description="run.reason"
    :message="adRunStatusLabels[run.status]"
    show-icon
    :type="
      run.status === 'APPLIED'
        ? 'success'
        : ['BLOCKED', 'FAILED'].includes(run.status)
          ? 'warning'
          : 'info'
    "
  />
  <ADescriptions bordered :column="1" size="small">
    <ADescriptionsItem label="商家账号">
      {{ run.merchantName }} · {{ merchantPlatformText(run.platform) }}
    </ADescriptionsItem>
    <ADescriptionsItem label="平台广告号">
      {{ run.platformAdId }}
    </ADescriptionsItem>
    <ADescriptionsItem label="运行方式">
      {{ adRunTriggerLabels[run.trigger] }} · 策略版本 {{ run.ruleVersion }}
    </ADescriptionsItem>
    <ADescriptionsItem
      v-if="run.evidence?.linkedFromRunId"
      label="联动来源记录"
    >
      {{ run.evidence.linkedFromRunId }}
    </ADescriptionsItem>
    <ADescriptionsItem label="结果">
      <ATag :color="adRunStatusColors[run.status]">
        {{ adRunStatusLabels[run.status] }}
      </ATag>
    </ADescriptionsItem>
    <ADescriptionsItem label="本轮当前价">
      {{ adPriceText(run.currentPrice) }}
    </ADescriptionsItem>
    <ADescriptionsItem label="建议价">
      {{ adPriceText(run.targetPrice) }}
    </ADescriptionsItem>
    <ADescriptionsItem label="回查实际价格">
      {{ adPriceText(run.actualPrice) }}
    </ADescriptionsItem>
    <ADescriptionsItem label="运行时间">
      {{ formatBusinessTime(run.createdAt) }}
    </ADescriptionsItem>
  </ADescriptions>

  <template v-if="run.evidence">
    <ADivider orientation="left">这次为什么这样报价</ADivider>
    <ADescriptions bordered :column="1" size="small">
      <ADescriptionsItem label="策略模式">
        {{ run.evidence.rule.mode === 'FIXED' ? '普通跟价' : '动态跟价' }}
      </ADescriptionsItem>
      <ADescriptionsItem v-if="run.evidence.reference" label="参考卖价">
        {{ run.evidence.reference.traderNickname }} 报价
        {{ adPriceText(run.evidence.reference.price) }}，实际取第
        {{ run.evidence.actualReferencePosition }} 条
      </ADescriptionsItem>
      <ADescriptionsItem label="本轮买价上限">
        {{ adPriceText(run.evidence.limit) }}
      </ADescriptionsItem>
      <ADescriptionsItem label="跟随同行">
        <template v-if="run.evidence.selected">
          {{ run.evidence.selected.traderNickname }}，收币价
          {{ adPriceText(run.evidence.selected.price) }}
        </template>
        <template v-else>没有选中同行</template>
      </ADescriptionsItem>
      <ADescriptionsItem label="加价格子">
        {{ run.evidence.rule.step }}
      </ADescriptionsItem>
      <ADescriptionsItem v-if="run.evidence.linkedAd" label="副广告联动">
        {{ run.evidence.linkedAd.platformAdId }}，折扣系数
        {{ run.evidence.linkedAd.discount }}， 目标价
        {{ adPriceText(run.evidence.linkedAd.targetPrice) }}
        <template v-if="run.evidence.linkedAd.runId">
          ，记录 {{ run.evidence.linkedAd.runId }}
        </template>
      </ADescriptionsItem>
      <ADescriptionsItem v-if="run.linkedRun" label="副广告执行结果">
        {{ adRunStatusLabels[run.linkedRun.status] }}，{{
          run.linkedRun.reason
        }}， 回查价 {{ adPriceText(run.linkedRun.actualPrice) }}
      </ADescriptionsItem>
    </ADescriptions>
    <ATable
      class="mt-4"
      :columns="candidateColumns"
      :data-source="run.evidence.candidates"
      :pagination="false"
      :row-key="
        (item: MerchantAdsApi.Evidence['candidates'][number]) =>
          item.quote.platformAdId
      "
      :scroll="{ x: 580 }"
      size="small"
    />
    <ACollapse class="mt-4">
      <ACollapsePanel key="market" header="查看本轮查询条件和参考行情">
        <p class="break-words">
          收币同行：{{ queryText(run.evidence.competitorQuery) }}
        </p>
        <p class="text-muted-foreground">
          查询时间：
          {{ formatBusinessTime(run.evidence.competitorSnapshot.fetchedAt) }}，
          共 {{ run.evidence.competitorSnapshot.quotes.length }} 条
        </p>
        <p class="text-muted-foreground">
          仅比较本次接口窗口：第
          {{ run.evidence.competitorSnapshot.window.page }} 页，每页
          {{ run.evidence.competitorSnapshot.window.rows }} 条
        </p>
        <template
          v-if="run.evidence.referenceQuery && run.evidence.referenceSnapshot"
        >
          <p class="break-words">
            卖币参考：{{ queryText(run.evidence.referenceQuery) }}
          </p>
          <p class="text-muted-foreground">
            查询时间：
            {{ formatBusinessTime(run.evidence.referenceSnapshot.fetchedAt) }}
          </p>
          <p class="text-muted-foreground">
            参考窗口：第
            {{ run.evidence.referenceSnapshot.window.page }} 页，每页
            {{ run.evidence.referenceSnapshot.window.rows }} 条
          </p>
          <ASpace :size="[4, 4]" wrap>
            <ATag
              v-for="(quote, index) in run.evidence.referenceSnapshot.quotes"
              :key="quote.platformAdId"
            >
              {{ index + 1 }}. {{ quote.traderNickname }}：{{
                adPriceText(quote.price)
              }}
            </ATag>
          </ASpace>
        </template>
      </ACollapsePanel>
    </ACollapse>
  </template>
</template>
