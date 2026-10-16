<script lang="ts" setup>
import type { Socket } from 'socket.io-client';

import type { MerchantChatApi } from '#/api';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  ArrowLeftOutlined,
  PictureOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import { message as toast } from 'ant-design-vue';

import { getMerchantChatApi, replyMerchantChatApi } from '#/api';
import { useSocketStore } from '#/store';

import {
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';
import { applyChatEvent, chatConnectionText, chatSendText } from './chat-state';
import ChatImage from './ChatImage.vue';

const route = useRoute();
const { hasAccessByCodes } = useAccess();
const { fixedTenantId, loadTenantOptions, tenantOptions } =
  useBusinessTenantFilter();
const sockets = useSocketStore();
const tenantId = ref('');
const merchantId = ref<string>();
const snapshot = ref<MerchantChatApi.Snapshot>();
const catalog = ref<MerchantChatApi.Merchant[]>([]);
let catalogTenantId = '';
const selectedId = ref('');
const loading = ref(false);
const sending = ref(false);
const connected = ref(false);
const error = ref('');
const text = ref('');
const image = ref<File>();
const imageInput = ref<HTMLInputElement>();
const messagePanel = ref<HTMLElement>();
let socket: Socket | undefined;
let generation = 0;
let buffered: MerchantChatApi.Event[] = [];
let expiryTimer: ReturnType<typeof setInterval>;
const selected = computed(() =>
  snapshot.value?.conversations.find((c) => c.id === selectedId.value),
);
const selectedMerchant = computed(() =>
  snapshot.value?.merchants.find(
    (m) => m.merchantId === (selected.value?.merchantId ?? merchantId.value),
  ),
);
const conversations = computed(() =>
  [...(snapshot.value?.conversations ?? [])].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  ),
);
const messages = computed(
  () =>
    snapshot.value?.messages
      .filter((m) => m.conversationId === selectedId.value)
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) ||
          a.receivedAt.localeCompare(b.receivedAt),
      ) ?? [],
);
const merchantOptions = computed(() =>
  catalog.value.map((m) => ({
    label: `${m.name} · ${merchantPlatformText(m.platform)}`,
    value: m.merchantId,
  })),
);
const canReply = computed(
  () =>
    hasAccessByCodes(['merchant:chat:read']) &&
    hasAccessByCodes(['merchant:chat:reply']) &&
    connected.value &&
    selected.value?.canReply &&
    selectedMerchant.value?.status === 'CONNECTED',
);
const composerHint = computed(() => {
  if (!hasAccessByCodes(['merchant:chat:reply'])) return '当前为只读权限';
  if (!connected.value) return '实时连接已断开，等待重连';
  if (selectedMerchant.value?.status !== 'CONNECTED')
    return '商家聊天未连接，暂时无法发送';
  if (!selected.value?.canReply) return '订单当前不可回复';
  return 'Enter 换行，Ctrl / Command + Enter 发送';
});

function chooseConversation(id: string) {
  if (sending.value) return;
  selectedId.value = id;
  text.value = '';
  image.value = undefined;
}
function unsubscribe() {
  socket?.emit('merchant-chat.unsubscribe');
}
function clearWindow() {
  snapshot.value = undefined;
  selectedId.value = '';
  text.value = '';
  image.value = undefined;
  buffered = [];
}
function eventReceived(event: MerchantChatApi.Event) {
  if (
    event.tenantId !== tenantId.value ||
    (merchantId.value && event.merchantId !== merchantId.value)
  )
    return;
  if (loading.value) {
    if (buffered.length < 100) buffered.push(event);
    else void refresh();
    return;
  }
  if (!snapshot.value || !applyChatEvent(snapshot.value, event)) {
    void refresh();
  }
}
function invalidated(payload: { reasonCode?: string }) {
  generation++;
  loading.value = false;
  connected.value = false;
  clearWindow();
  if (payload.reasonCode === 'CHAT_RESYNC_REQUIRED') {
    void refresh();
    return;
  }
  error.value = '聊天订阅或权限已失效，请重新登录或检查授权';
}
function disconnected() {
  connected.value = false;
}
function reconnected() {
  void refresh();
}
async function refresh() {
  if (!tenantId.value) return;
  const current = ++generation;
  loading.value = true;
  error.value = '';
  buffered = [];
  try {
    if (catalogTenantId !== tenantId.value) {
      const initial = await getMerchantChatApi({ tenantId: tenantId.value });
      if (current !== generation) return;
      catalog.value = initial.merchants;
      catalogTenantId = tenantId.value;
    }
    let result: MerchantChatApi.Snapshot;
    if (socket?.connected) {
      const response = (await socket
        .timeout(15_000)
        .emitWithAck('merchant-chat.subscribe', {
          tenantId: tenantId.value,
          ...(merchantId.value ? { merchantId: merchantId.value } : {}),
        })) as { ok: boolean; snapshot?: MerchantChatApi.Snapshot };
      if (!response.ok || !response.snapshot)
        throw new Error('聊天订阅失败，请检查权限');
      result = response.snapshot;
    } else
      result = await getMerchantChatApi({
        tenantId: tenantId.value,
        merchantId: merchantId.value,
      });
    if (current !== generation) return;
    if (snapshot.value?.instanceId !== result.instanceId) {
      selectedId.value = '';
      text.value = '';
      image.value = undefined;
    }
    snapshot.value = result;
    connected.value = !!socket?.connected;
    for (const event of buffered) {
      if (!applyChatEvent(result, event))
        throw new Error('聊天运行窗口已变化，请刷新');
    }
    buffered = [];
    if (!selectedId.value && typeof route.query.orderId === 'string')
      selectedId.value =
        result.conversations.find(
          (c) => c.merchantOrderId === route.query.orderId,
        )?.id ?? '';
  } catch {
    if (current === generation) {
      clearWindow();
      connected.value = false;
      error.value = '无法加载实时聊天，请检查权限或稍后刷新';
    }
  } finally {
    if (current === generation) loading.value = false;
  }
}
function pickImage(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (
    file &&
    (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 10 * 1024 * 1024)
  ) {
    toast.error('请选择 10 MiB 内的 JPEG、PNG 或 WebP 图片');
    return;
  }
  image.value = file;
  if (imageInput.value) imageInput.value.value = '';
}
async function send() {
  if (
    !canReply.value ||
    sending.value ||
    !selected.value ||
    !snapshot.value ||
    (!text.value.trim() && !image.value)
  )
    return;
  const conversation = selected.value;
  const body = {
    conversationId: conversation.id,
    instanceId: snapshot.value.instanceId,
    requestId: crypto.randomUUID(),
    text: text.value.trim(),
    image: image.value,
  };
  sending.value = true;
  try {
    const result = await replyMerchantChatApi(
      { tenantId: tenantId.value, merchantId: conversation.merchantId },
      body,
    );
    if (selectedId.value === conversation.id) {
      text.value = '';
      image.value = undefined;
    }
    if (result.messages.some((m) => m.status === 'UNKNOWN'))
      toast.warning('部分发送结果未知，请先到交易平台核实，勿重复发送');
    else if (result.messages.some((m) => m.status === 'FAILED'))
      toast.error('部分消息发送失败，请检查连接与图片格式');
  } catch {
    toast.warning('发送请求未完成，请先刷新并核实结果，勿重复发送');
  } finally {
    sending.value = false;
  }
}
function onComposerKeydown(event: KeyboardEvent) {
  if (
    event.key === 'Enter' &&
    !event.isComposing &&
    (event.ctrlKey || event.metaKey)
  ) {
    event.preventDefault();
    send();
  }
}
watch(tenantId, () => {
  merchantId.value = undefined;
});
watch([tenantId, merchantId], () => {
  generation++;
  unsubscribe();
  clearWindow();
  void refresh();
});
watch(
  [selectedId, () => messages.value.at(-1)?.id],
  async ([conversationId], [previousId]) => {
    const panel = messagePanel.value;
    const atBottom =
      conversationId !== previousId ||
      !panel ||
      panel.scrollHeight - panel.scrollTop - panel.clientHeight < 120;
    await nextTick();
    if (messagePanel.value && atBottom)
      messagePanel.value.scrollTop = messagePanel.value.scrollHeight;
  },
);
onMounted(async () => {
  if (!sockets.socket) sockets.connect();
  socket = sockets.socket ?? undefined;
  socket?.on('merchant-chat.event', eventReceived);
  socket?.on('merchant-chat.invalidated', invalidated);
  socket?.on('connect', reconnected);
  socket?.on('disconnect', disconnected);
  try {
    const defaultTenant = await loadTenantOptions();
    const requested =
      typeof route.query.tenantId === 'string' ? route.query.tenantId : '';
    tenantId.value =
      !fixedTenantId.value &&
      tenantOptions.some(
        (option) => option.value === requested && !option.disabled,
      )
        ? requested
        : defaultTenant;
  } catch {
    error.value = '无法加载所属单位，请稍后刷新页面';
    return;
  }
  await nextTick();
  merchantId.value =
    typeof route.query.merchantId === 'string'
      ? route.query.merchantId
      : undefined;
  expiryTimer = setInterval(() => {
    if (snapshot.value) {
      const cutoff = Date.now() - snapshot.value.retentionSeconds * 1000;
      snapshot.value.messages = snapshot.value.messages.filter(
        (m) => Date.parse(m.receivedAt) > cutoff,
      );
      snapshot.value.conversations = snapshot.value.conversations.filter((c) =>
        snapshot.value?.messages.some((m) => m.conversationId === c.id),
      );
    }
  }, 30_000);
});
onBeforeUnmount(() => {
  generation++;
  unsubscribe();
  socket?.off('merchant-chat.event', eventReceived);
  socket?.off('merchant-chat.invalidated', invalidated);
  socket?.off('connect', reconnected);
  socket?.off('disconnect', disconnected);
  clearInterval(expiryTimer);
  clearWindow();
});
</script>

<template>
  <Page auto-content-height>
    <div class="chat-workspace flex h-full min-h-0 flex-col gap-3">
      <div class="bg-card rounded-lg border p-4">
        <h2 class="mb-3 text-base font-semibold">实时聊天</h2>
        <a-form layout="inline" class="chat-filters">
          <a-form-item
            v-if="!fixedTenantId"
            label="所属单位"
            class="chat-filter-field"
          >
            <a-select
              v-model:value="tenantId"
              :options="tenantOptions"
              aria-label="所属单位"
              :disabled="sending"
            />
          </a-form-item>
          <a-form-item label="商家" class="chat-filter-field">
            <a-select
              v-model:value="merchantId"
              :options="merchantOptions"
              allow-clear
              placeholder="全部商家"
              aria-label="商家"
              :disabled="sending"
            >
              <template #option="{ label }">
                <span class="whitespace-normal break-words">{{ label }}</span>
              </template>
            </a-select>
          </a-form-item>
          <a-form-item>
            <a-button :loading="loading" @click="refresh">
              <template #icon><ReloadOutlined /></template>刷新
            </a-button>
          </a-form-item>
        </a-form>
      </div>
      <a-alert v-if="error" :message="error" type="error" show-icon />
      <a-alert
        v-else-if="selectedMerchant?.platform === 'OKX'"
        message="欧易聊天待接入，当前不可接收或发送消息"
        type="info"
        show-icon
      />
      <div
        class="bg-card flex min-h-0 flex-1 overflow-hidden rounded-lg border"
      >
        <aside
          class="chat-sidebar flex min-h-0 w-80 shrink-0 flex-col border-r"
          :class="{ 'chat-hidden-mobile': selected }"
        >
          <div class="flex items-center justify-between border-b p-4">
            <span class="font-medium">当前会话</span>
            <span class="text-muted-foreground text-xs">
              {{ conversations.length }} 个
            </span>
          </div>
          <a-spin v-if="loading && !snapshot" class="p-8" />
          <div v-else class="min-h-0 flex-1 overflow-y-auto">
            <a-empty
              v-if="conversations.length === 0"
              description="暂无实时会话"
              class="my-12"
            >
              <p class="text-muted-foreground px-4 text-xs">
                收到当前买币订单的新消息后显示
              </p>
            </a-empty>
            <button
              v-for="conversation in conversations"
              :key="conversation.id"
              type="button"
              class="hover:bg-accent focus-visible:ring-ring w-full border-b p-4 text-left outline-none focus-visible:ring-2"
              :class="{ 'bg-accent': selectedId === conversation.id }"
              :aria-pressed="selectedId === conversation.id"
              @click="chooseConversation(conversation.id)"
            >
              <div class="mb-1 flex min-w-0 items-center justify-between gap-2">
                <span class="truncate font-medium">
                  {{ conversation.buyerName }}
                </span>
                <span class="text-muted-foreground shrink-0 text-xs">
                  {{
                    String(formatBusinessTime(conversation.updatedAt)).slice(-8)
                  }}
                </span>
              </div>
              <div class="text-muted-foreground truncate text-xs">
                {{
                  snapshot?.merchants.find(
                    (m) => m.merchantId === conversation.merchantId,
                  )?.name
                }}
              </div>
              <div class="text-muted-foreground mt-1 break-all text-xs">
                订单 {{ conversation.platformOrderId }}
              </div>
            </button>
          </div>
        </aside>
        <section
          class="flex min-h-0 min-w-0 flex-1 flex-col"
          :class="{ 'chat-hidden-mobile': !selected }"
          aria-label="聊天消息"
        >
          <template v-if="selected">
            <header class="flex flex-wrap items-center gap-3 border-b p-4">
              <a-button
                type="text"
                class="chat-back"
                aria-label="返回会话列表"
                @click="selectedId = ''"
              >
                <ArrowLeftOutlined />
              </a-button>
              <div class="min-w-0 flex-1">
                <div class="font-medium">{{ selected.buyerName }}</div>
                <div class="text-muted-foreground break-all text-xs">
                  订单 {{ selected.platformOrderId }}
                </div>
              </div>
              <a-tag
                :color="
                  selectedMerchant?.status === 'CONNECTED'
                    ? 'success'
                    : 'default'
                "
              >
                {{
                  selectedMerchant
                    ? chatConnectionText[selectedMerchant.status]
                    : '未连接'
                }}
              </a-tag>
            </header>
            <div
              ref="messagePanel"
              class="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
              role="log"
              aria-label="当前聊天消息"
              aria-live="polite"
              aria-relevant="additions"
            >
              <div
                v-for="item in messages"
                :key="item.id"
                class="flex"
                :class="
                  item.origin === 'SELF' ? 'justify-end' : 'justify-start'
                "
              >
                <div class="max-w-[85%] sm:max-w-[75%]">
                  <div class="text-muted-foreground mb-1 text-xs">
                    {{
                      item.origin === 'SELF'
                        ? '商家'
                        : item.origin === 'PLATFORM_AUTO'
                          ? '平台自动消息'
                          : selected.buyerName
                    }}
                    · {{ formatBusinessTime(item.occurredAt) }}
                  </div>
                  <div
                    class="rounded-lg border px-3 py-2"
                    :class="
                      item.origin === 'SELF' ? 'bg-primary/10' : 'bg-muted/50'
                    "
                  >
                    <p
                      v-if="item.text"
                      class="whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                    >
                      {{ item.text }}
                    </p>
                    <ChatImage
                      v-if="item.attachmentId && snapshot"
                      :scope="{ tenantId, merchantId: selected.merchantId }"
                      :instance-id="snapshot.instanceId"
                      :message="item"
                    />
                    <span
                      v-else-if="item.type === 'IMAGE'"
                      class="text-muted-foreground text-xs"
                    >
                      图片{{
                        item.status === 'SENDING' ? '发送中' : '暂不可读取'
                      }}
                    </span>
                  </div>
                  <div
                    v-if="item.status"
                    class="mt-1 text-xs"
                    :class="
                      item.status === 'FAILED' || item.status === 'UNKNOWN'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                    "
                  >
                    {{ chatSendText[item.status] }}
                  </div>
                </div>
              </div>
            </div>
            <footer class="border-t p-4">
              <p class="text-muted-foreground mb-2 text-xs">
                {{ composerHint }}
              </p>
              <a-textarea
                v-model:value="text"
                aria-label="回复内容"
                placeholder="输入回复内容"
                :maxlength="4000"
                :auto-size="{ minRows: 2, maxRows: 5 }"
                :disabled="!canReply || sending"
                @keydown="onComposerKeydown"
              />
              <div
                class="mt-3 flex flex-wrap items-center justify-between gap-2"
              >
                <div class="flex min-w-0 items-center gap-2">
                  <input
                    ref="imageInput"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    class="hidden"
                    aria-label="选择聊天图片"
                    @change="pickImage"
                  />
                  <a-button
                    :disabled="!canReply || sending"
                    @click="imageInput?.click()"
                  >
                    <template #icon><PictureOutlined /></template>图片
                  </a-button>
                  <a-tag
                    v-if="image"
                    closable
                    :title="image.name"
                    class="max-w-40 truncate"
                    @close="image = undefined"
                  >
                    {{ image.name }}
                  </a-tag>
                </div>
                <a-button
                  type="primary"
                  :loading="sending"
                  :disabled="!canReply || (!text.trim() && !image)"
                  @click="send"
                >
                  <template #icon><SendOutlined /></template>发送
                </a-button>
              </div>
            </footer>
          </template>
          <a-empty
            v-else
            :description="
              selectedMerchant?.platform === 'OKX'
                ? '欧易聊天待接入'
                : '选择左侧会话开始查看'
            "
            class="m-auto p-6"
          />
        </section>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.chat-workspace {
  min-height: 420px;
}

.chat-back {
  display: none;
}

.chat-filters {
  gap: 12px;
  align-items: center;
}

.chat-filters :deep(.ant-form-item) {
  margin-inline-end: 0;
}

.chat-filter-field {
  width: 320px;
  min-width: 0;
  max-width: 100%;
}

.chat-filters :deep(.ant-form-item-control) {
  flex: 1;
  min-width: 0;
}

@media (width <= 767px) {
  .chat-sidebar {
    width: 100%;
    border-right: 0;
  }

  .chat-hidden-mobile {
    display: none;
  }

  .chat-back {
    display: inline-flex;
  }

  .chat-filters {
    gap: 8px;
  }

  .chat-filter-field {
    width: 100%;
  }

  .chat-filter-field :deep(.ant-form-item-control) {
    flex: 0 0 100%;
  }
}
</style>
