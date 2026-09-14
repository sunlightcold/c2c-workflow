<script lang="ts" setup>
import type { StorageApi } from '#/api';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import {
  createStorageChannelApi,
  disableStorageChannelApi,
  enableStorageChannelApi,
  getStorageChannelsApi,
  getStoragePurposesApi,
  removeStorageChannelApi,
  rotateStorageChannelCredentialsApi,
  testStorageChannelApi,
  updateStorageChannelApi,
  updateStoragePurposeBindingApi,
} from '#/api';
import { AsyncStatusSwitch } from '#/components';
import { confirmResourceAction, runResourceAction } from '#/hooks';

type EditorMode = 'create' | 'edit';

const channels = ref<StorageApi.Channel[]>([]);
const purposes = ref<StorageApi.StoragePurpose[]>([]);
const loading = ref(false);
const editorOpen = ref(false);
const editorMode = ref<EditorMode>('create');
const editingChannelId = ref<string>();
const bindingOpen = ref(false);
const bindingPurpose = ref<StorageApi.StoragePurpose>();
const bindingForm = reactive({ channelId: '', keyPrefixOverride: '' });
const bindingPreviewPrefix = computed(() => {
  const override = bindingForm.keyPrefixOverride.trim().replace(/\/+$/, '');
  return override
    ? `${override}/`
    : (bindingPurpose.value?.defaultKeyPrefix ?? '');
});
const bindingPrefixError = computed(() => {
  const prefix = bindingForm.keyPrefixOverride.trim().replace(/\/+$/, '');
  if (!prefix) return '';
  if (prefix.length >= 128) return '对象前缀不能超过 128 个字符';
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?(?:\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?)*$/.test(
    prefix,
  )
    ? ''
    : '仅支持小写字母、数字、点、短横线、下划线和多级目录';
});

const channelForm = reactive<StorageApi.ChannelInput>({
  accessKeyId: '',
  bucket: '',
  code: '',
  endpoint: '',
  forcePathStyle: true,
  name: '',
  provider: 's3_compatible',
  publicBaseUrl: '',
  region: 'auto',
  secretAccessKey: '',
});

const activeChannels = computed(() =>
  channels.value.filter((channel) => channel.status === 'active'),
);

async function refresh() {
  loading.value = true;
  try {
    const [nextChannels, nextPurposes] = await Promise.all([
      getStorageChannelsApi(),
      getStoragePurposesApi(),
    ]);
    channels.value = nextChannels;
    purposes.value = nextPurposes;
  } finally {
    loading.value = false;
  }
}

function resetForm() {
  Object.assign(channelForm, {
    accessKeyId: '',
    bucket: '',
    code: '',
    endpoint: '',
    forcePathStyle: true,
    name: '',
    provider: 's3_compatible',
    publicBaseUrl: '',
    region: 'auto',
    secretAccessKey: '',
  });
}

function openCreate() {
  resetForm();
  editorMode.value = 'create';
  editingChannelId.value = undefined;
  editorOpen.value = true;
}

function openEdit(channel: StorageApi.Channel) {
  Object.assign(channelForm, {
    accessKeyId: channel.accessKeyId,
    bucket: channel.bucket,
    code: channel.code,
    endpoint: channel.endpoint,
    forcePathStyle: channel.forcePathStyle,
    name: channel.name,
    provider: channel.provider,
    publicBaseUrl: channel.publicBaseUrl ?? '',
    region: channel.region,
    secretAccessKey: '',
  });
  editorMode.value = 'edit';
  editingChannelId.value = channel.id;
  editorOpen.value = true;
}

async function submitChannel() {
  if (editorMode.value === 'create') {
    await runResourceAction({
      action: () => createStorageChannelApi(channelForm),
      onSuccess: async () => {
        editorOpen.value = false;
        await refresh();
      },
      successMessage: '渠道已创建，请先测试并启用',
    });
    return;
  }
  const id = editingChannelId.value;
  if (!id) return;
  await runResourceAction({
    action: async () => {
      await updateStorageChannelApi(id, {
        name: channelForm.name,
        publicBaseUrl: channelForm.publicBaseUrl || null,
      });
      if (channelForm.secretAccessKey) {
        await rotateStorageChannelCredentialsApi(id, {
          accessKeyId: channelForm.accessKeyId,
          secretAccessKey: channelForm.secretAccessKey,
        });
      }
    },
    onSuccess: async () => {
      editorOpen.value = false;
      await refresh();
    },
    successMessage: '渠道已更新',
  });
}

function removeChannel(channel: StorageApi.Channel) {
  confirmResourceAction({
    action: () => removeStorageChannelApi(channel.id),
    onSuccess: refresh,
    successMessage: '渠道已删除',
    title: `删除渠道“${channel.name}”？`,
  });
}

async function testChannel(channel: StorageApi.Channel) {
  await runResourceAction({
    action: () => testStorageChannelApi(channel.id),
    onSuccess: refresh,
    successMessage: '连接测试成功',
  });
}

async function changeChannelStatus(
  channel: StorageApi.Channel,
  checked: boolean,
) {
  await runResourceAction({
    action: () =>
      checked
        ? enableStorageChannelApi(channel.id)
        : disableStorageChannelApi(channel.id),
    onSuccess: refresh,
    successMessage: checked ? '渠道已启用' : '渠道已停用',
  });
}

function openBinding(purpose: StorageApi.StoragePurpose) {
  bindingPurpose.value = purpose;
  bindingForm.channelId = purpose.bindingChannelId ?? '';
  bindingForm.keyPrefixOverride = purpose.keyPrefixOverride ?? '';
  bindingOpen.value = true;
}

function resetBindingPrefix() {
  bindingForm.keyPrefixOverride = '';
}

async function submitBinding() {
  const purpose = bindingPurpose.value;
  if (!purpose || !bindingForm.channelId) return;
  const keyPrefixOverride = bindingForm.keyPrefixOverride.trim();
  await runResourceAction({
    action: () =>
      updateStoragePurposeBindingApi(
        purpose.code,
        bindingForm.channelId,
        keyPrefixOverride ? `${keyPrefixOverride.replace(/\/+$/, '')}/` : null,
      ),
    onSuccess: async () => {
      bindingOpen.value = false;
      await refresh();
    },
    successMessage: '用途绑定已更新',
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
}

onMounted(refresh);
</script>

<template>
  <Page auto-content-height>
    <ATabs>
      <ATabPane key="channels" tab="存储渠道">
        <div class="storage-toolbar">
          <span>渠道配置</span>
          <AButton
            v-access:code="['system:storage:create']"
            size="small"
            type="primary"
            @click="openCreate"
          >
            新增渠道
          </AButton>
        </div>
        <ATable
          :data-source="channels"
          :loading="loading"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <ATableColumn data-index="name" title="渠道" :width="180">
            <template #default="{ record }">
              <div>{{ record.name }}</div>
              <span class="storage-code">{{ record.code }}</span>
            </template>
          </ATableColumn>
          <ATableColumn data-index="bucket" title="Bucket" :width="160" />
          <ATableColumn data-index="endpoint" title="Endpoint" ellipsis />
          <ATableColumn data-index="status" title="状态" :width="150">
            <template #default="{ record }">
              <ASpace :size="6">
                <AsyncStatusSwitch
                  v-access:code="['system:storage:update']"
                  :checked="record.status === 'active'"
                  :label="`${record.name}状态`"
                  :request="(checked) => changeChannelStatus(record, checked)"
                />
                <ATag v-if="record.status === 'error'" color="error">
                  异常
                </ATag>
              </ASpace>
            </template>
          </ATableColumn>
          <ATableColumn
            data-index="lastCheckedAt"
            title="最近测试"
            :width="180"
          >
            <template #default="{ record }">
              {{
                record.lastCheckedAt
                  ? formatDateTime(record.lastCheckedAt)
                  : '未测试'
              }}
            </template>
          </ATableColumn>
          <ATableColumn
            align="center"
            key="action"
            fixed="right"
            title="操作"
            :width="210"
          >
            <template #default="{ record }">
              <ASpace :size="12" wrap>
                <AButton
                  v-access:code="['system:storage:test']"
                  size="small"
                  type="link"
                  @click="testChannel(record)"
                >
                  测试
                </AButton>
                <AButton
                  v-access:code="['system:storage:update']"
                  size="small"
                  type="link"
                  @click="openEdit(record)"
                >
                  编辑
                </AButton>
                <AButton
                  v-access:code="['system:storage:delete']"
                  danger
                  :disabled="record.status === 'active'"
                  size="small"
                  type="link"
                  @click="removeChannel(record)"
                >
                  删除
                </AButton>
              </ASpace>
            </template>
          </ATableColumn>
        </ATable>
      </ATabPane>

      <ATabPane key="bindings" tab="用途绑定">
        <ATable
          :data-source="purposes"
          :loading="loading"
          :pagination="false"
          row-key="code"
          size="small"
        >
          <ATableColumn data-index="code" title="用途" :width="220" />
          <ATableColumn data-index="group" title="范围" :width="100">
            <template #default="{ record }">
              {{ record.group === 'system' ? '系统' : 'App' }}
            </template>
          </ATableColumn>
          <ATableColumn data-index="visibility" title="访问" :width="100">
            <template #default="{ record }">
              {{ record.visibility === 'public' ? '公开' : '私有' }}
            </template>
          </ATableColumn>
          <ATableColumn data-index="keyPrefix" title="对象前缀" :width="230">
            <template #default="{ record }">
              <div class="storage-prefix">{{ record.keyPrefix }}</div>
              <span v-if="record.keyPrefixOverride" class="storage-code">
                默认 {{ record.defaultKeyPrefix }}
              </span>
            </template>
          </ATableColumn>
          <ATableColumn key="binding" title="写入渠道" :width="220">
            <template #default="{ record }">
              {{ record.bindingChannelName || '未绑定' }}
            </template>
          </ATableColumn>
          <ATableColumn
            align="center"
            key="bindingAction"
            title="操作"
            :width="90"
          >
            <template #default="{ record }">
              <AButton
                v-access:code="['system:storage:bind']"
                size="small"
                type="link"
                @click="openBinding(record)"
              >
                配置
              </AButton>
            </template>
          </ATableColumn>
        </ATable>
      </ATabPane>
    </ATabs>

    <AModal
      v-model:open="editorOpen"
      :title="editorMode === 'create' ? '新增存储渠道' : '编辑存储渠道'"
      :width="680"
      @ok="submitChannel"
    >
      <AForm
        :label-col="{ span: 7 }"
        :model="channelForm"
        :wrapper-col="{ span: 15 }"
      >
        <AFormItem label="渠道名称">
          <AInput v-model:value="channelForm.name" />
        </AFormItem>
        <AFormItem label="渠道编码">
          <AInput
            v-model:value="channelForm.code"
            :disabled="editorMode === 'edit'"
          />
        </AFormItem>
        <AFormItem label="Endpoint">
          <AInput
            v-model:value="channelForm.endpoint"
            :disabled="editorMode === 'edit'"
          />
        </AFormItem>
        <AFormItem label="Region">
          <AInput
            v-model:value="channelForm.region"
            :disabled="editorMode === 'edit'"
          />
        </AFormItem>
        <AFormItem label="Bucket">
          <AInput
            v-model:value="channelForm.bucket"
            :disabled="editorMode === 'edit'"
          />
        </AFormItem>
        <AFormItem label="公开访问地址">
          <AInput v-model:value="channelForm.publicBaseUrl" />
        </AFormItem>
        <AFormItem label="Access Key">
          <AInput v-model:value="channelForm.accessKeyId" />
        </AFormItem>
        <AFormItem
          :label="editorMode === 'create' ? 'Secret Key' : '新 Secret Key'"
        >
          <AInputPassword v-model:value="channelForm.secretAccessKey" />
        </AFormItem>
      </AForm>
    </AModal>

    <AModal
      v-model:open="bindingOpen"
      :ok-button-props="{
        disabled: !bindingForm.channelId || !!bindingPrefixError,
      }"
      title="配置用途绑定"
      :width="520"
      @ok="submitBinding"
    >
      <AForm
        v-if="bindingPurpose"
        :label-col="{ span: 6 }"
        :wrapper-col="{ span: 17 }"
      >
        <AFormItem label="用途">
          <span class="storage-code">{{ bindingPurpose.code }}</span>
        </AFormItem>
        <AFormItem label="写入渠道" required>
          <ASelect
            v-model:value="bindingForm.channelId"
            :options="
              activeChannels.map((channel) => ({
                label: channel.name,
                value: channel.id,
              }))
            "
            placeholder="选择已启用渠道"
            style="width: 100%"
          />
        </AFormItem>
        <AFormItem
          label="对象前缀"
          :help="bindingPrefixError || '留空使用用途默认前缀'"
          :validate-status="bindingPrefixError ? 'error' : ''"
        >
          <AInput
            v-model:value="bindingForm.keyPrefixOverride"
            :maxlength="128"
            placeholder="例如 avatars/"
          />
          <div class="storage-preview">
            最终路径：{{ bindingPreviewPrefix }}user.webp
          </div>
          <AButton size="small" type="link" @click="resetBindingPrefix">
            恢复默认
          </AButton>
        </AFormItem>
      </AForm>
    </AModal>
  </Page>
</template>

<style scoped>
.storage-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-weight: 600;
}

.storage-code {
  font-family: monospace;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
}

.storage-prefix {
  font-family: monospace;
}

.storage-preview {
  margin-top: 6px;
  font-family: monospace;
  font-size: 12px;
  color: rgb(0 0 0 / 45%);
}
</style>
