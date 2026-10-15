<script setup lang="ts">
import type { Rule } from 'ant-design-vue/es/form';

import type { MerchantAdsApi } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { getMerchantAdsApi, updateMerchantAdRuleApi } from '#/api';
import { runResourceAction } from '#/hooks';

import { adPaymentMethodText, adWechatPaymentMethods } from '../shared/ad-ui';

const props = defineProps<{ ad: MerchantAdsApi.Ad }>();
const emit = defineEmits<{ saved: [ad: MerchantAdsApi.Ad] }>();
const saving = ref(false);
const linkedOptions = ref<{ label: string; value: string }[]>([]);
const linkedLoading = ref(false);
const linkedLoadError = ref(false);
async function loadLinkedAds() {
  linkedLoading.value = true;
  linkedLoadError.value = false;
  try {
    const items: MerchantAdsApi.Ad[] = [];
    for (let page = 1; ; page += 1) {
      const result = await getMerchantAdsApi({
        tenantId: props.ad.tenantId,
        merchantId: props.ad.merchantId,
        page,
        pageSize: 100,
      });
      items.push(...result.items);
      if (page >= result.meta.totalPages) break;
    }
    linkedOptions.value = items
      .filter(
        (ad) =>
          ad.id !== props.ad.id && ad.fiatCurrency === props.ad.fiatCurrency,
      )
      .map((ad) => {
        let reason = '';
        if (ad.pricing.role !== 'INDEPENDENT') reason = '已参与广告联动';
        else if (ad.pendingRunId) reason = '有在途调价';
        else if (ad.enabled) reason = '独立自动调价中';
        return {
          label: `${ad.platformAdId} · ${ad.status === 'ONLINE' ? '在线' : '离线'}${reason ? ` · ${reason}` : ''}`,
          value: ad.id,
          disabled: ad.id !== props.ad.rule?.linkedAdId && Boolean(reason),
        };
      });
  } catch {
    linkedLoadError.value = true;
  } finally {
    linkedLoading.value = false;
  }
}
onMounted(loadLinkedAds);
type RuleDraft = Omit<
  MerchantAdsApi.Rule,
  | 'competitorPeriod'
  | 'feePercent'
  | 'fixedLimit'
  | 'followNickname'
  | 'linkedAdId'
  | 'linkedDiscount'
  | 'profitPerUsdt'
> & {
  competitorPeriod?: number;
  feePercent?: string;
  fixedLimit?: string;
  followNickname?: string;
  linkedAdId?: string;
  linkedDiscount?: string;
  profitPerUsdt?: string;
};
const draft = reactive<RuleDraft>(
  props.ad.rule
    ? {
        excludeInactive: false,
        ...props.ad.rule,
        linkedAdId: props.ad.rule.linkedAdId ?? undefined,
        linkedDiscount: props.ad.rule.linkedDiscount ?? undefined,
        blockedNicknames: [...props.ad.rule.blockedNicknames],
        competitorPeriod: props.ad.rule.competitorPeriod ?? undefined,
        competitorPaymentMethods: [...props.ad.rule.competitorPaymentMethods],
        feePercent: props.ad.rule.feePercent ?? undefined,
        fixedLimit: props.ad.rule.fixedLimit ?? undefined,
        followNickname: props.ad.rule.followNickname ?? undefined,
        profitPerUsdt: props.ad.rule.profitPerUsdt ?? undefined,
        referencePaymentMethods: [...props.ad.rule.referencePaymentMethods],
      }
    : {
        excludeInactive: false,
        linkedAdId: undefined,
        linkedDiscount: undefined,
        blockedNicknames: [],
        competitorAmount: '0',
        competitorPaymentMethods: [...props.ad.paymentMethods],
        competitorPeriod: undefined,
        feePercent: undefined,
        fixedLimit: undefined,
        followNickname: undefined,
        intervalSeconds: 60,
        merchantOnly: true,
        mode: 'FIXED',
        profitPerUsdt: undefined,
        referencePaymentMethods: [],
        referencePosition: 1,
        step: '0.01',
      },
);

function clearLinkedAd() {
  draft.linkedAdId = undefined;
  draft.linkedDiscount = undefined;
}
const paymentOptions = computed(() =>
  [
    ...new Set([
      ...(props.ad.fiatCurrency === 'CNY'
        ? [adWechatPaymentMethods[props.ad.platform]]
        : []),
      ...draft.competitorPaymentMethods,
      ...draft.referencePaymentMethods,
      ...props.ad.paymentMethods,
    ]),
  ].map((value) => ({ label: adPaymentMethodText(value), value })),
);
const required = (message: string): Rule[] => [
  { message, required: true, trigger: 'blur' },
];
const rules = computed(() => ({
  linkedDiscount: draft.linkedAdId ? required('请填写副广告折扣系数') : [],
  competitorAmount: required('请填写同行查询金额，0 表示不限'),
  feePercent: draft.mode === 'DYNAMIC' ? required('请填写实际手续费率') : [],
  fixedLimit: draft.mode === 'FIXED' ? required('请填写买价上限') : [],
  intervalSeconds: required('请填写检查间隔'),
  profitPerUsdt:
    draft.mode === 'DYNAMIC' ? required('请填写每个 USDT 预留价差') : [],
  referencePosition: required('请选择参考卖价位置'),
  step: required('请填写加价格子'),
}));

async function save() {
  saving.value = true;
  try {
    await runResourceAction({
      action: async () => {
        const ad = await updateMerchantAdRuleApi(props.ad.id, {
          merchantId: props.ad.merchantId,
          rule: {
            ...draft,
            linkedAdId: draft.linkedAdId ?? null,
            linkedDiscount: draft.linkedAdId
              ? (draft.linkedDiscount ?? null)
              : null,
            competitorPeriod: draft.competitorPeriod ?? null,
            feePercent:
              draft.mode === 'DYNAMIC' ? (draft.feePercent ?? null) : null,
            fixedLimit:
              draft.mode === 'FIXED' ? (draft.fixedLimit ?? null) : null,
            followNickname: draft.followNickname?.trim() || null,
            profitPerUsdt:
              draft.mode === 'DYNAMIC' ? (draft.profitPerUsdt ?? null) : null,
          },
          tenantId: props.ad.tenantId,
        });
        emit('saved', ad);
      },
      successMessage: '广告策略已保存',
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AForm layout="vertical" :model="draft" :rules="rules" @finish="save">
    <AAlert
      class="mb-4"
      message="先保存策略，再试算。试算只看结果，不修改平台广告。"
      show-icon
      type="info"
    />
    <AFormItem label="策略模式" name="mode">
      <ARadioGroup v-model:value="draft.mode" aria-label="策略模式">
        <ARadioButton value="FIXED">普通跟价</ARadioButton>
        <ARadioButton value="DYNAMIC">动态跟价</ARadioButton>
      </ARadioGroup>
    </AFormItem>

    <ARow :gutter="16">
      <ACol v-if="draft.mode === 'FIXED'" :md="12" :xs="24">
        <AFormItem
          label="买价上限"
          name="fixedLimit"
          :extra="`单位：${ad.fiatCurrency}/USDT，最终报价不能超过它`"
        >
          <AInputNumber
            v-model:value="draft.fixedLimit"
            aria-label="买价上限"
            class="w-full"
            :min="0"
            string-mode
          />
        </AFormItem>
      </ACol>
      <template v-else>
        <ACol :md="12" :xs="24">
          <AFormItem
            label="每个 USDT 预留价差"
            name="profitPerUsdt"
            :extra="`单位：${ad.fiatCurrency}/USDT；填 0.05 表示每个币留 0.05 ${ad.fiatCurrency} 价差`"
          >
            <AInputNumber
              v-model:value="draft.profitPerUsdt"
              aria-label="每个 USDT 预留价差"
              class="w-full"
              :min="0"
              string-mode
            />
          </AFormItem>
        </ACol>
        <ACol :md="12" :xs="24">
          <AFormItem
            label="手续费率（%）"
            name="feePercent"
            extra="填 0.11 表示 0.11%，请按商家实际费率填写"
          >
            <AInputNumber
              v-model:value="draft.feePercent"
              aria-label="手续费率"
              class="w-full"
              :min="0"
              :max="100"
              string-mode
            />
          </AFormItem>
        </ACol>
        <ACol :md="12" :xs="24">
          <AFormItem
            label="参考卖价位置"
            name="referencePosition"
            extra="卖价从低到高排序，取第几条；不足时取最后一条"
          >
            <AInputNumber
              v-model:value="draft.referencePosition"
              aria-label="参考卖价位置"
              class="w-full"
              :min="1"
              :max="10"
              :precision="0"
            />
          </AFormItem>
        </ACol>
        <ACol :md="12" :xs="24">
          <AFormItem
            label="参考卖价支付方式"
            extra="留空不限；多项匹配任意一种"
          >
            <ASelect
              v-model:value="draft.referencePaymentMethods"
              aria-label="参考卖价支付方式"
              class="w-full"
              mode="tags"
              option-filter-prop="label"
              :options="paymentOptions"
            />
          </AFormItem>
        </ACol>
      </template>
      <ACol :md="12" :xs="24">
        <AFormItem
          label="加价格子"
          name="step"
          extra="如 0.01：同行 7.09 → 建议 7.10；必须是 0.01 的正整数倍"
        >
          <AInputNumber
            v-model:value="draft.step"
            aria-label="加价格子"
            class="w-full"
            :min="0.01"
            :step="0.01"
            string-mode
          />
        </AFormItem>
      </ACol>
      <ACol :md="12" :xs="24">
        <AFormItem label="检查间隔（秒）" name="intervalSeconds">
          <AInputNumber
            v-model:value="draft.intervalSeconds"
            aria-label="检查间隔"
            class="w-full"
            :min="15"
            :max="86400"
            :precision="0"
          />
        </AFormItem>
      </ACol>
    </ARow>

    <ADivider orientation="left">看哪些收币同行</ADivider>
    <ARow :gutter="16">
      <ACol :md="12" :xs="24">
        <AFormItem
          label="同行查询金额"
          name="competitorAmount"
          :extra="`单位：${ad.fiatCurrency}，0 表示不限；只筛选行情，不改自己广告限额`"
        >
          <AInputNumber
            v-model:value="draft.competitorAmount"
            aria-label="同行查询金额"
            class="w-full"
            :min="0"
            string-mode
          />
        </AFormItem>
      </ACol>
      <ACol :md="12" :xs="24">
        <AFormItem label="同行支付方式" extra="留空不限；多项匹配任意一种">
          <ASelect
            v-model:value="draft.competitorPaymentMethods"
            aria-label="同行支付方式"
            class="w-full"
            mode="tags"
            option-filter-prop="label"
            :options="paymentOptions"
          />
        </AFormItem>
      </ACol>
      <ACol :md="12" :xs="24">
        <AFormItem
          label="同行付款时限（分钟）"
          extra="留空不限；平台不支持此条件时会明确提示"
        >
          <AInputNumber
            v-model:value="draft.competitorPeriod"
            aria-label="同行付款时限"
            class="w-full"
            :min="1"
            :precision="0"
          />
        </AFormItem>
      </ACol>
      <ACol :md="12" :xs="24">
        <AFormItem
          label="指定同行昵称"
          extra="留空看所有同行；填写后只看昵称完全一致的同行"
        >
          <AInput
            v-model:value="draft.followNickname"
            aria-label="指定同行昵称"
            :maxlength="100"
          />
        </AFormItem>
      </ACol>
      <ACol :md="12" :xs="24">
        <AFormItem label="同行黑名单" extra="输入昵称后按回车添加，精确匹配">
          <ASelect
            v-model:value="draft.blockedNicknames"
            aria-label="同行黑名单"
            class="w-full"
            mode="tags"
          />
        </AFormItem>
      </ACol>
    </ARow>
    <AFormItem label="只看商家">
      <ASwitch v-model:checked="draft.merchantOnly" aria-label="只看商家" />
    </AFormItem>
    <ARow :gutter="16">
      <ACol :md="12" :xs="24">
        <AFormItem
          label="排除不活跃同行"
          extra="超过 20 分钟未活跃则跳过；平台未提供活跃时间时不排除"
        >
          <ASwitch
            v-model:checked="draft.excludeInactive"
            aria-label="排除不活跃同行"
          />
        </AFormItem>
      </ACol>
    </ARow>
    <ADivider orientation="left">副广告联动</ADivider>
    <AAlert
      v-if="
        ad.pricing.role === 'MAIN' && ad.pricing.linkedAd.status !== 'ONLINE'
      "
      class="mb-3"
      message="副广告未在线，当前无法联动调价。请在平台上线后同步广告，或解除关联。"
      show-icon
      type="warning"
    />
    <p v-if="ad.pricing.role === 'MAIN'" class="mb-3">
      主广告 {{ ad.platformAdId }} → 副广告
      {{ ad.pricing.linkedAd.platformAdId }} （{{
        ad.pricing.linkedAd.status === 'ONLINE' ? '在线' : '离线'
      }}）。 副广告跟随本策略，不单独启动；清空副广告并保存可解除关联。
    </p>
    <p v-if="linkedLoadError" class="mb-3">
      副广告列表加载失败。<AButton type="link" @click="loadLinkedAds">
        重试
      </AButton>
    </p>
    <ARow :gutter="16">
      <ACol :md="12" :xs="24">
        <AFormItem label="副广告" extra="选择同商家、同法币广告；留空不联动">
          <ASelect
            v-model:value="draft.linkedAdId"
            aria-label="副广告"
            allow-clear
            show-search
            option-filter-prop="label"
            :options="linkedOptions"
            :loading="linkedLoading"
          />
          <AButton v-if="draft.linkedAdId" type="link" @click="clearLinkedAd">
            解除联动
          </AButton>
          <span v-if="draft.linkedAdId" class="text-muted-foreground text-xs">
            保存策略后生效
          </span>
        </AFormItem>
      </ACol>
      <ACol v-if="draft.linkedAdId" :md="12" :xs="24">
        <AFormItem
          label="副广告折扣系数"
          name="linkedDiscount"
          extra="填 0.01 表示低 1%；主价 7.10，副价 7.02"
        >
          <AInputNumber
            v-model:value="draft.linkedDiscount"
            aria-label="副广告折扣系数"
            class="w-full"
            :min="0"
            :max="0.99999999"
            :step="0.01"
            string-mode
          />
        </AFormItem>
      </ACol>
    </ARow>
    <AButton
      v-access:code="['merchant:ad:rule']"
      html-type="submit"
      :loading="saving"
      type="primary"
    >
      保存策略
    </AButton>
  </AForm>
</template>
