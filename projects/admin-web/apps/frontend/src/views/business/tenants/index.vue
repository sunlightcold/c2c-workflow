<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';

import type { BusinessApi } from '#/api';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { createTenantApi, getTenantsApi, setTenantStatusApi } from '#/api';
import { runResourceAction } from '#/hooks';

import {
  businessStatusColor,
  businessStatusText,
  formatBusinessTime,
  validateBusinessForm,
} from '../shared/business-ui';

const items = ref<BusinessApi.Tenant[]>([]);
const loading = ref(false);
const createOpen = ref(false);
const createFormRef = ref<FormInstance>();
const form = reactive({ code: '', name: '', timezone: 'Asia/Shanghai' });

async function refresh() {
  loading.value = true;
  try {
    items.value = await getTenantsApi();
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!(await validateBusinessForm(createFormRef.value))) return;
  await runResourceAction({
    action: () => createTenantApi(form),
    onSuccess: async () => {
      createOpen.value = false;
      Object.assign(form, { code: '', name: '', timezone: 'Asia/Shanghai' });
      await refresh();
    },
    successMessage: '代理商已创建',
  });
}

async function toggleStatus(tenant: BusinessApi.Tenant) {
  const status = tenant.status === 'active' ? 'disabled' : 'active';
  await runResourceAction({
    action: () => setTenantStatusApi(tenant.id, status),
    onSuccess: refresh,
    successMessage: status === 'active' ? '所属单位已启用' : '所属单位已停用',
  });
}

onMounted(refresh);
</script>

<template>
  <Page auto-content-height>
    <div class="mb-3 flex items-center justify-between gap-3">
      <div>
        <div class="text-base font-semibold">所属单位</div>
        <div class="text-muted-foreground text-sm">
          总部自营与代理商共用同一套经营能力
        </div>
      </div>
      <AButton
        v-access:code="['agency:tenant:create']"
        type="primary"
        @click="createOpen = true"
      >
        新增代理商
      </AButton>
    </div>
    <ATable
      :data-source="items"
      :loading="loading"
      row-key="id"
      :scroll="{ x: 900 }"
    >
      <ATableColumn data-index="name" title="单位名称" :width="200" />
      <ATableColumn data-index="code" title="单位编码" :width="150" />
      <ATableColumn key="type" title="类型" :width="140">
        <template #default="{ record }">
          {{ record.type === 'HEADQUARTERS_SELF' ? '总部自营' : '代理商' }}
        </template>
      </ATableColumn>
      <ATableColumn data-index="timezone" title="业务时区" :width="160" />
      <ATableColumn key="status" title="状态" :width="100">
        <template #default="{ record }">
          <ATag :color="businessStatusColor(record.status)">
            {{ businessStatusText(record.status) }}
          </ATag>
        </template>
      </ATableColumn>
      <ATableColumn key="createdAt" title="创建时间" :width="190">
        <template #default="{ record }">
          {{ formatBusinessTime(record.createdAt) }}
        </template>
      </ATableColumn>
      <ATableColumn key="action" fixed="right" title="操作" :width="110">
        <template #default="{ record }">
          <AButton
            v-if="!record.systemLocked"
            v-access:code="['agency:tenant:update']"
            size="small"
            type="link"
            @click="toggleStatus(record)"
          >
            {{ record.status === 'active' ? '停用' : '启用' }}
          </AButton>
          <span v-else class="text-muted-foreground">系统固定</span>
        </template>
      </ATableColumn>
    </ATable>

    <AModal v-model:open="createOpen" title="新增代理商" @ok="submit">
      <AForm ref="createFormRef" :model="form" layout="vertical">
        <AFormItem
          label="代理商名称"
          name="name"
          :rules="[{ required: true, message: '请输入代理商名称' }]"
        >
          <AInput v-model:value="form.name" :maxlength="100" />
        </AFormItem>
        <AFormItem
          label="代理商编码"
          name="code"
          :rules="[{ required: true, message: '请输入代理商编码' }]"
        >
          <AInput v-model:value="form.code" :maxlength="32" />
        </AFormItem>
        <AFormItem
          label="业务时区"
          name="timezone"
          :rules="[{ required: true, message: '请输入业务时区' }]"
        >
          <AInput v-model:value="form.timezone" :maxlength="64" />
        </AFormItem>
      </AForm>
    </AModal>
  </Page>
</template>
