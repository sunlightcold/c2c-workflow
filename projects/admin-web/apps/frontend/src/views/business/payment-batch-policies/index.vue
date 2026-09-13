<script lang="tsx" setup>
import type { VbenFormProps } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { BusinessApi } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import {
  createPaymentBatchPolicyApi,
  deletePaymentBatchPolicyApi,
  getMerchantsApi,
  getPaymentBatchPoliciesApi,
  setPaymentBatchPolicyStatusApi,
  submitPaymentBatchPolicyApi,
  updatePaymentBatchPolicyApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import {
  confirmResourceAction,
  runResourceAction,
  useResourceGrid,
} from '#/hooks';

import { createEmptyBusinessPage } from '../shared/business-grid';
import {
  businessStatusOptions,
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';

type RuleDraft = BusinessApi.PaymentBatchPolicyRuleInput & { key: number };
type SearchValues = {
  merchantId?: string;
  scopeType?: BusinessApi.PaymentBatchPolicyScope;
  status?: BusinessApi.BusinessStatus;
  tenantId?: string;
};
type QueryParams = SearchValues & { pageIndex: number; pageSize: number };

const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const selectedTenantId = ref('');
const merchants = ref<BusinessApi.Merchant[]>([]);
const merchantOptions = reactive<Array<{ label: string; value: string }>>([]);
const modalOpen = ref(false);
const saving = ref(false);
const editing = ref<BusinessApi.PaymentBatchPolicy>();
const policyName = ref('');
const policyMerchantId = ref('');
const policyScopeType = ref<'' | BusinessApi.PaymentBatchPolicyScope>('');
const selectedScopeType = ref<'' | BusinessApi.PaymentBatchPolicyScope>('');
const rules = ref<RuleDraft[]>([]);
let nextRuleKey = 1;

const ruleTypeOptions = [
  { label: '手动提交', value: 'MANUAL' },
  { label: '按时间间隔', value: 'INTERVAL' },
  { label: '按订单数', value: 'ORDER_COUNT' },
];
const scopeTypeOptions = [
  { label: '经营单位全局', value: 'GLOBAL' },
  { label: '指定商家', value: 'MERCHANT' },
];

const formOptions: VbenFormProps = {
  commonConfig: { labelWidth: 86 },
  schema: [
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: false,
        'aria-label': '选择经营单位',
        disabled: Boolean(fixedTenantId.value),
        onChange: (value: string) => void selectTenant(value, true),
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
        onChange: (value?: BusinessApi.PaymentBatchPolicyScope) =>
          void selectScopeType(value),
        options: scopeTypeOptions,
        placeholder: '全部范围',
      }),
      fieldName: 'scopeType',
      label: '策略范围',
    },
    {
      component: 'Select',
      componentProps: () => ({
        allowClear: true,
        disabled: selectedScopeType.value === 'GLOBAL',
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
        options: businessStatusOptions,
        placeholder: '全部状态',
      },
      fieldName: 'status',
      label: '状态',
    },
  ],
  wrapperClass: '2xl:grid-cols-4 xl:grid-cols-3 lg:grid-cols-2 md:grid-cols-1',
};

const gridOptions: VxeTableGridOptions<BusinessApi.PaymentBatchPolicy> = {
  columns: [
    { type: 'seq', width: 60 },
    { field: 'name', minWidth: 180, title: '策略名称' },
    {
      field: 'scopeType',
      formatter: ({ cellValue }) =>
        cellValue === 'GLOBAL' ? '经营单位全局' : '指定商家',
      title: '策略范围',
      width: 130,
    },
    {
      field: 'merchantId',
      minWidth: 170,
      title: '适用商家',
      formatter: ({ cellValue }) => merchantName(cellValue as null | string),
    },
    {
      field: 'rules',
      minWidth: 300,
      slots: { default: 'rules' },
      title: '并行规则',
    },
    {
      field: 'status',
      slots: { default: 'status' },
      title: '状态',
      width: 100,
    },
    {
      field: 'updatedAt',
      formatter: ({ cellValue }) => formatBusinessTime(cellValue as string),
      title: '更新时间',
      width: 180,
    },
    {
      align: 'center',
      field: 'action',
      fixed: 'right',
      slots: { default: 'action' },
      title: '操作',
      width: 210,
    },
  ],
};

const [Grid, gridApi] = useResourceGrid<
  BusinessApi.PaymentBatchPolicy,
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
      ? getPaymentBatchPoliciesApi({
          merchantId: params.merchantId,
          page: params.pageIndex,
          pageSize: params.pageSize,
          status: params.status,
          scopeType: params.scopeType,
          tenantId,
        })
      : Promise.resolve(
          createEmptyBusinessPage(params.pageIndex, params.pageSize),
        );
  },
});

const modalTitle = computed(() =>
  editing.value ? '编辑批次策略' : '新增批次策略',
);

async function selectTenant(tenantId: string, refresh: boolean) {
  selectedTenantId.value = tenantId;
  merchants.value = tenantId ? await getMerchantsApi({ tenantId }) : [];
  merchantOptions.splice(
    0,
    merchantOptions.length,
    ...merchants.value.map((merchant) => ({
      label: `${merchant.name} · ${merchantPlatformText(merchant.platform)}`,
      value: merchant.id,
    })),
  );
  await gridApi.formApi.setFieldValue('merchantId', undefined);
  if (refresh) await gridApi.query();
}

async function selectScopeType(
  scopeType?: BusinessApi.PaymentBatchPolicyScope,
) {
  selectedScopeType.value = scopeType ?? '';
  if (scopeType === 'GLOBAL') {
    await gridApi.formApi.setFieldValue('merchantId', undefined);
  }
}

function createRule(
  ruleType: BusinessApi.PaymentBatchRuleType = 'MANUAL',
): RuleDraft {
  return { key: nextRuleKey++, ruleType, status: 'active' };
}

function openCreate() {
  editing.value = undefined;
  policyName.value = '';
  policyMerchantId.value = '';
  policyScopeType.value = '';
  rules.value = [createRule()];
  modalOpen.value = true;
}

function openEdit(policy: BusinessApi.PaymentBatchPolicy) {
  editing.value = policy;
  policyName.value = policy.name;
  policyMerchantId.value = policy.merchantId ?? '';
  policyScopeType.value = policy.scopeType;
  rules.value = policy.rules.map((rule) => ({
    intervalSeconds: rule.intervalSeconds ?? undefined,
    key: nextRuleKey++,
    orderCount: rule.orderCount ?? undefined,
    ruleType: rule.ruleType,
    status: rule.status,
  }));
  modalOpen.value = true;
}

function changeRuleType(rule: RuleDraft) {
  rule.intervalSeconds =
    rule.ruleType === 'INTERVAL' ? (rule.intervalSeconds ?? 60) : undefined;
  rule.orderCount =
    rule.ruleType === 'ORDER_COUNT' ? (rule.orderCount ?? 10) : undefined;
}

function removeRule(key: number) {
  if (rules.value.length === 1) {
    message.warning('批次策略至少保留一条规则');
    return;
  }
  rules.value = rules.value.filter((rule) => rule.key !== key);
}

function validatePolicy() {
  if (!policyName.value.trim()) return '请输入策略名称';
  if (!policyScopeType.value) return '请选择策略范围';
  if (policyScopeType.value === 'MERCHANT' && !policyMerchantId.value) {
    return '请选择商家账号';
  }
  if (!rules.value.some(({ status }) => status === 'active')) {
    return '至少启用一条批次规则';
  }
  if (
    rules.value.some(
      (rule) =>
        (rule.ruleType === 'INTERVAL' && !rule.intervalSeconds) ||
        (rule.ruleType === 'ORDER_COUNT' && !rule.orderCount),
    )
  ) {
    return '请填写规则参数';
  }
}

async function savePolicy() {
  const validationMessage = validatePolicy();
  if (validationMessage) {
    message.warning(validationMessage);
    return;
  }
  const payload = {
    name: policyName.value.trim(),
    rules: rules.value.map(({ key: _key, ...rule }) => rule),
    tenantId: selectedTenantId.value,
  };
  saving.value = true;
  try {
    await runResourceAction({
      action: () =>
        editing.value
          ? updatePaymentBatchPolicyApi(editing.value.id, payload)
          : createPaymentBatchPolicyApi({
              ...payload,
              merchantId:
                policyScopeType.value === 'MERCHANT'
                  ? policyMerchantId.value
                  : undefined,
              scopeType:
                policyScopeType.value as BusinessApi.PaymentBatchPolicyScope,
            }),
      onSuccess: async () => {
        modalOpen.value = false;
        await gridApi.reload();
      },
      successMessage: editing.value ? '批次策略已更新' : '批次策略已新增',
    });
  } finally {
    saving.value = false;
  }
}

function changeStatus(
  policy: BusinessApi.PaymentBatchPolicy,
  checked: boolean,
) {
  const status = checked ? 'active' : 'disabled';
  return runResourceAction({
    action: () =>
      setPaymentBatchPolicyStatusApi(policy.id, {
        status,
        tenantId: selectedTenantId.value,
      }),
    onSuccess: () => gridApi.query(),
    successMessage: status === 'active' ? '批次策略已启用' : '批次策略已停用',
  });
}

function submitManually(policy: BusinessApi.PaymentBatchPolicy) {
  confirmResourceAction({
    action: () =>
      submitPaymentBatchPolicyApi(policy.id, {
        tenantId: selectedTenantId.value,
      }),
    content: `系统将把当前符合“${policy.name}”的待支付订单生成批次，并立即向支付宝发起付款。没有符合条件的订单时不会创建批次。`,
    onSuccess: () => gridApi.query(),
    successMessage: '符合条件的支付批次已提交',
    title: '立即提交待支付订单？',
  });
}

function removePolicy(policy: BusinessApi.PaymentBatchPolicy) {
  confirmResourceAction({
    action: () =>
      deletePaymentBatchPolicyApi(policy.id, selectedTenantId.value),
    content: '已被支付方案或订单使用的策略不能删除，只能停用。',
    okButtonProps: { danger: true },
    okText: '删除',
    onSuccess: () => gridApi.reload(),
    successMessage: '批次策略已删除',
    title: '确认删除批次策略吗？',
  });
}

function merchantName(id: null | string) {
  if (!id) return '全部商家';
  return (
    merchants.value.find((merchant) => merchant.id === id)?.name ?? '未知商家'
  );
}

function changePolicyScope(scopeType: unknown) {
  if (scopeType === 'GLOBAL') policyMerchantId.value = '';
}

function ruleText(rule: BusinessApi.PaymentBatchPolicyRule) {
  if (rule.ruleType === 'MANUAL') return '手动提交';
  if (rule.ruleType === 'INTERVAL') return `间隔 ${rule.intervalSeconds} 秒`;
  return `满 ${rule.orderCount} 笔`;
}

function hasManualRule(policy: BusinessApi.PaymentBatchPolicy) {
  return policy.rules.some(
    (rule) => rule.status === 'active' && rule.ruleType === 'MANUAL',
  );
}

onMounted(async () => {
  selectedTenantId.value = await loadTenantOptions();
  if (!selectedTenantId.value) return;
  await gridApi.formApi.setFieldValue('tenantId', selectedTenantId.value);
  await selectTenant(selectedTenantId.value, false);
  await gridApi.query();
});
</script>

<template>
  <Page auto-content-height>
    <Grid>
      <template #toolbar-actions>
        <AButton
          v-access:code="['payment:batchPolicy:create']"
          :disabled="!selectedTenantId"
          size="small"
          type="primary"
          @click="openCreate"
        >
          新增批次策略
        </AButton>
      </template>
      <template #rules="{ row }">
        <ASpace :size="[4, 4]" wrap>
          <ATag
            v-for="rule in row.rules"
            :key="rule.id"
            :color="rule.status === 'active' ? 'blue' : undefined"
          >
            {{ ruleText(rule)
            }}{{ rule.status === 'disabled' ? '（停用）' : '' }}
          </ATag>
        </ASpace>
      </template>
      <template #status="{ row }">
        <AsyncStatusSwitch
          v-access:code="['payment:batchPolicy:update']"
          :checked="row.status === 'active'"
          :label="`${row.name}状态`"
          :request="(checked) => changeStatus(row, checked)"
        />
      </template>
      <template #action="{ row }">
        <ASpace :size="4">
          <AButton
            v-if="hasManualRule(row) && row.status === 'active'"
            v-access:code="['payment:batchPolicy:update']"
            size="small"
            @click="submitManually(row)"
          >
            手动提交
          </AButton>
          <AButton
            v-access:code="['payment:batchPolicy:update']"
            size="small"
            type="link"
            @click="openEdit(row)"
          >
            编辑
          </AButton>
          <AButton
            v-access:code="['payment:batchPolicy:delete']"
            danger
            size="small"
            type="link"
            @click="removePolicy(row)"
          >
            删除
          </AButton>
        </ASpace>
      </template>
    </Grid>

    <AModal
      v-model:open="modalOpen"
      :body-style="{
        maxHeight: 'calc(100dvh - 180px)',
        overflowX: 'hidden',
        overflowY: 'auto',
      }"
      centered
      :confirm-loading="saving"
      :title="modalTitle"
      width="min(820px, 94vw)"
      @ok="savePolicy"
    >
      <AForm layout="vertical">
        <ARow :gutter="16">
          <ACol :md="12" :xs="24">
            <AFormItem label="策略名称" required>
              <AInput
                v-model:value="policyName"
                aria-label="策略名称"
                :maxlength="100"
              />
            </AFormItem>
          </ACol>
          <ACol :md="12" :xs="24">
            <AFormItem label="策略范围" required>
              <ASelect
                v-model:value="policyScopeType"
                aria-label="策略范围"
                :disabled="Boolean(editing)"
                :options="scopeTypeOptions"
                placeholder="请选择策略范围"
                @change="changePolicyScope"
              />
            </AFormItem>
          </ACol>
          <ACol v-if="policyScopeType === 'MERCHANT'" :md="12" :xs="24">
            <AFormItem label="商家账号" required>
              <ASelect
                v-model:value="policyMerchantId"
                aria-label="商家账号"
                :disabled="Boolean(editing)"
                :options="merchantOptions"
                placeholder="请选择商家账号"
                show-search
              />
            </AFormItem>
          </ACol>
        </ARow>

        <div class="mb-2 flex items-center justify-between">
          <span class="font-medium">并行规则</span>
          <AButton size="small" @click="rules.push(createRule())">
            添加规则
          </AButton>
        </div>
        <div
          class="hidden grid-cols-[180px_minmax(0,1fr)_64px_64px] gap-3 px-3 pb-2 text-sm font-medium md:grid"
        >
          <span>提交模式</span>
          <span>规则参数</span>
          <span class="text-center">启用</span>
          <span class="text-center">操作</span>
        </div>
        <div
          v-for="(rule, index) in rules"
          :key="rule.key"
          class="grid grid-cols-1 items-center gap-3 border-t py-3 md:grid-cols-[180px_minmax(0,1fr)_64px_64px] md:px-3"
          data-testid="payment-batch-policy-rule"
        >
          <div>
            <div class="text-muted-foreground mb-1 text-xs md:hidden">
              规则 {{ index + 1 }} · 提交模式
            </div>
            <ASelect
              v-model:value="rule.ruleType"
              :aria-label="`规则 ${index + 1} 提交模式`"
              :options="ruleTypeOptions"
              class="w-full"
              @change="changeRuleType(rule)"
            />
          </div>
          <div>
            <div class="text-muted-foreground mb-1 text-xs md:hidden">
              规则参数
            </div>
            <span
              v-if="rule.ruleType === 'MANUAL'"
              class="text-muted-foreground"
            >
              由运营人员提交
            </span>
            <AInputNumber
              v-else-if="rule.ruleType === 'INTERVAL'"
              v-model:value="rule.intervalSeconds"
              :aria-label="`规则 ${index + 1} 时间间隔`"
              :max="86400"
              :min="10"
              addon-after="秒"
              class="w-full"
            />
            <AInputNumber
              v-else
              v-model:value="rule.orderCount"
              :aria-label="`规则 ${index + 1} 订单数`"
              :max="500"
              :min="1"
              addon-after="笔"
              class="w-full"
            />
          </div>
          <div class="flex items-center justify-between md:justify-center">
            <span class="text-muted-foreground text-xs md:hidden">启用</span>
            <ASwitch
              :aria-label="`规则 ${index + 1} 启用状态`"
              :checked="rule.status === 'active'"
              @change="rule.status = $event ? 'active' : 'disabled'"
            />
          </div>
          <div class="flex justify-end md:justify-center">
            <AButton
              danger
              size="small"
              type="link"
              @click="removeRule(rule.key)"
            >
              删除
            </AButton>
          </div>
        </div>
      </AForm>
    </AModal>
  </Page>
</template>
