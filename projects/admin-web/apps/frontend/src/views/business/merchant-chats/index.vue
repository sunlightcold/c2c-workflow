<script lang="ts" setup>
import type { Socket } from 'socket.io-client';

import type { MerchantChatApi } from '#/api';
import type { MerchantChatTarget } from '#/store';

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
  ArrowDownOutlined,
  ArrowLeftOutlined,
  DeleteOutlined,
  DownOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import { message as toast } from 'ant-design-vue';

import {
  deleteMerchantChatConversationApi,
  getMerchantChatApi,
  openMerchantChatConversationApi,
  replyMerchantChatApi,
} from '#/api';
import { confirmResourceAction } from '#/hooks';
import { useMerchantChatNavigationStore, useSocketStore } from '#/store';

import {
  formatBusinessTime,
  merchantPlatformText,
} from '../shared/business-ui';
import { useBusinessTenantFilter } from '../shared/use-business-tenant-filter';
import {
  applyChatEvent,
  chatConversationItems,
  chatSendText,
  formatChatDecimal,
} from './chat-state';
import ChatImage from './ChatImage.vue';
import ChatOrderInfo from './ChatOrderInfo.vue';
import ChatOrderStatus from './ChatOrderStatus.vue';
import OrderSelectModal from './OrderSelectModal.vue';

const route = useRoute();
const chatNavigation = useMerchantChatNavigationStore();
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
const creating = ref(false);
const deleting = ref(false);
const orderModalOpen = ref(false);
const connected = ref(false);
const error = ref('');
const text = ref('');
const image = ref<File>();
const conversationSearch = ref('');
const orderInfoOpen = ref(false);
const atLatest = ref(true);
const drafts = new Map<string, { image?: File; text: string }>();
const imageInput = ref<HTMLInputElement>();
const messagePanel = ref<HTMLElement>();
let socket: Socket | undefined;
let generation = 0;
let buffered: MerchantChatApi.Event[] = [];
let expiryTimer: ReturnType<typeof setInterval>;
let routeReady = false;
let defaultTenantId = '';
let orderTarget: MerchantChatTarget | undefined;
const navigationBusy = computed(
  () => sending.value || deleting.value || creating.value,
);
const selected = computed(() =>
  snapshot.value?.conversations.find((c) => c.id === selectedId.value),
);
const selectedMerchant = computed(() =>
  snapshot.value?.merchants.find(
    (m) => m.merchantId === (selected.value?.merchantId ?? merchantId.value),
  ),
);
const conversations = computed(() =>
  snapshot.value
    ? chatConversationItems(snapshot.value, conversationSearch.value)
    : [],
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
    !deleting.value &&
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

function getActionPopupContainer() {
  return window.document.body;
}

function chooseConversation(id: string) {
  if (sending.value || deleting.value) return false;
  if (selectedId.value === id) return true;
  if (selectedId.value) {
    if (text.value || image.value)
      drafts.set(selectedId.value, { text: text.value, image: image.value });
    else drafts.delete(selectedId.value);
  }
  selectedId.value = id;
  text.value = drafts.get(id)?.text ?? '';
  image.value = drafts.get(id)?.image;
  atLatest.value = true;
  orderInfoOpen.value = false;
  return true;
}
function onMessageScroll() {
  const panel = messagePanel.value;
  if (panel)
    atLatest.value =
      panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
}
async function jumpToLatest() {
  await nextTick();
  if (messagePanel.value)
    messagePanel.value.scrollTop = messagePanel.value.scrollHeight;
  atLatest.value = true;
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
  drafts.clear();
  conversationSearch.value = '';
  orderInfoOpen.value = false;
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
    const target = orderTarget;
    let targetConversationId = '';
    if (
      target?.merchantOrderId &&
      target.tenantId === tenantId.value &&
      target.merchantId === merchantId.value
    ) {
      const existing = result.conversations.find(
        (c) =>
          c.merchantOrderId === target.merchantOrderId &&
          c.merchantId === target.merchantId,
      );
      if (existing) targetConversationId = existing.id;
      else {
        const opened = await openMerchantChatConversationApi({
          tenantId: target.tenantId,
          merchantId: target.merchantId,
          merchantOrderId: target.merchantOrderId,
        });
        if (current !== generation) return;
        if (opened.instanceId !== result.instanceId)
          throw new Error('聊天运行窗口已变化');
        if (!result.conversations.some((c) => c.id === opened.conversation.id))
          result.conversations.push(opened.conversation);
        targetConversationId = opened.conversation.id;
      }
    }
    snapshot.value = result;
    connected.value = !!socket?.connected;
    for (const event of buffered) {
      if (!applyChatEvent(result, event))
        throw new Error('聊天运行窗口已变化，请刷新');
    }
    buffered = [];
    if (
      targetConversationId &&
      chooseConversation(targetConversationId) &&
      orderTarget === target
    )
      orderTarget = undefined;
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
function deleteConversation() {
  const conversation = selected.value;
  const instanceId = snapshot.value?.instanceId;
  if (!conversation || !instanceId || sending.value || deleting.value) return;
  confirmResourceAction({
    title: '删除会话？',
    content:
      '将清理该订单在后台的当前会话和消息，其他在线后台也会同步移除。交易平台记录不受影响，新消息到达后可重新生成会话。',
    okText: '删除',
    okType: 'danger',
    action: async () => {
      deleting.value = true;
      try {
        return await deleteMerchantChatConversationApi(conversation.id, {
          tenantId: conversation.tenantId,
          merchantId: conversation.merchantId,
          instanceId,
        });
      } finally {
        deleting.value = false;
      }
    },
    onSuccess: async () => {
      if (snapshot.value?.instanceId === instanceId) await refresh();
    },
    successMessage: '会话已删除',
  });
}
async function openOrderConversation(order: MerchantChatApi.Order) {
  if (creating.value) return;
  const scopeTenant = tenantId.value;
  const current = generation;
  creating.value = true;
  try {
    const opened = await openMerchantChatConversationApi({
      tenantId: scopeTenant,
      merchantId: order.merchantId,
      merchantOrderId: order.id,
    });
    if (current !== generation || tenantId.value !== scopeTenant) return;
    orderModalOpen.value = false;
    if (merchantId.value && merchantId.value !== order.merchantId) {
      merchantId.value = order.merchantId;
      await nextTick();
    }
    await refresh();
    if (
      snapshot.value?.instanceId === opened.instanceId &&
      snapshot.value.conversations.some((c) => c.id === opened.conversation.id)
    )
      chooseConversation(opened.conversation.id);
  } finally {
    creating.value = false;
  }
}
function applyNavigationTarget() {
  const target = chatNavigation.takeTarget();
  const requested = target?.tenantId ?? '';
  const nextTenant =
    !fixedTenantId.value &&
    tenantOptions.some(
      (option) => option.value === requested && !option.disabled,
    )
      ? requested
      : defaultTenantId;
  const acceptedTarget = target?.tenantId === nextTenant ? target : undefined;
  orderTarget = acceptedTarget?.merchantOrderId ? acceptedTarget : undefined;
  const nextMerchant = acceptedTarget?.merchantId;
  const changed =
    tenantId.value !== nextTenant || merchantId.value !== nextMerchant;
  tenantId.value = nextTenant;
  merchantId.value = nextMerchant;
  if (!changed) void refresh();
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
    drafts.delete(conversation.id);
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
watch([tenantId, merchantId], () => {
  if (
    orderTarget &&
    (orderTarget.tenantId !== tenantId.value ||
      orderTarget.merchantId !== merchantId.value)
  )
    orderTarget = undefined;
  generation++;
  unsubscribe();
  clearWindow();
  orderModalOpen.value = false;
  void refresh();
});
watch(
  [() => route.path, () => chatNavigation.pendingTarget, navigationBusy],
  ([path, target, busy], [previousPath, , wasBusy]) => {
    if (routeReady && path === '/business/merchant-chats' && !busy) {
      if (target) applyNavigationTarget();
      else if (orderTarget && (wasBusy || path !== previousPath))
        void refresh();
    }
  },
);
watch(selected, (conversation) => {
  if (!conversation && selectedId.value) {
    selectedId.value = '';
    text.value = '';
    image.value = undefined;
    orderInfoOpen.value = false;
  }
});
watch(
  [selectedId, () => messages.value.at(-1)?.id],
  async ([conversationId], [previousId]) => {
    if (conversationId !== previousId || atLatest.value) await jumpToLatest();
  },
);
watch(
  () => snapshot.value?.conversations.map((conversation) => conversation.id),
  (ids) => {
    const active = new Set(ids);
    for (const id of drafts.keys()) if (!active.has(id)) drafts.delete(id);
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
    defaultTenantId = await loadTenantOptions();
    routeReady = true;
    applyNavigationTarget();
  } catch {
    error.value = '无法加载所属单位，请稍后刷新页面';
    return;
  }
  expiryTimer = setInterval(() => {
    if (snapshot.value) {
      const cutoff = Date.now() - snapshot.value.retentionSeconds * 1000;
      snapshot.value.messages = snapshot.value.messages.filter(
        (m) => Date.parse(m.receivedAt) > cutoff,
      );
      snapshot.value.conversations = snapshot.value.conversations.filter(
        (c) => Date.parse(c.updatedAt) > cutoff,
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
              :disabled="sending || creating || deleting"
              @change="merchantId = undefined"
            />
          </a-form-item>
          <a-form-item label="商家" class="chat-filter-field">
            <a-select
              v-model:value="merchantId"
              :options="merchantOptions"
              allow-clear
              placeholder="全部商家"
              aria-label="商家"
              :disabled="sending || creating || deleting"
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
          <a-form-item>
            <a-button
              type="primary"
              :disabled="
                !tenantId || loading || sending || creating || deleting
              "
              @click="orderModalOpen = true"
            >
              <template #icon><PlusOutlined /></template>新增会话
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
          class="chat-sidebar flex min-h-0 shrink-0 flex-col border-r"
          :class="{ 'chat-hidden-mobile': selected }"
        >
          <div class="flex items-center justify-between px-4 pb-3 pt-4">
            <span class="font-medium">当前会话</span>
            <span class="text-muted-foreground text-xs">
              {{ conversations.length }} 个
            </span>
          </div>
          <div class="border-b px-4 pb-4">
            <a-input-search
              v-model:value="conversationSearch"
              allow-clear
              placeholder="搜索买家、商家或订单号"
              aria-label="搜索当前会话"
            />
          </div>
          <a-spin v-if="loading && !snapshot" class="p-8" />
          <div v-else class="min-h-0 flex-1 overflow-y-auto">
            <a-empty
              v-if="conversations.length === 0"
              :description="
                conversationSearch ? '没有匹配的会话' : '暂无实时会话'
              "
              class="my-12"
            >
              <p class="text-muted-foreground px-4 text-xs">
                {{
                  conversationSearch
                    ? '试试其他买家、商家或订单号'
                    : '点击新增会话，选择订单开始沟通'
                }}
              </p>
            </a-empty>
            <button
              v-for="conversation in conversations"
              :key="conversation.id"
              type="button"
              class="chat-conversation hover:bg-accent focus-visible:ring-ring w-full border-b px-4 py-3 text-left outline-none focus-visible:ring-2"
              :class="{
                'chat-conversation-active': selectedId === conversation.id,
              }"
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
              <div class="mb-1 flex min-w-0 items-center gap-2">
                <span class="shrink-0 text-sm font-semibold tabular-nums">
                  {{ conversation.order.fiatAmount }}
                  {{ conversation.order.fiatCurrency }}
                </span>
                <span
                  class="text-muted-foreground truncate text-xs"
                  :title="conversation.preview"
                >
                  {{ conversation.preview }}
                </span>
              </div>
              <ChatOrderStatus :order="conversation.order" compact />
            </button>
          </div>
        </aside>
        <section
          class="chat-main flex min-h-0 min-w-0 flex-1 flex-col"
          :class="{ 'chat-hidden-mobile': !selected }"
          aria-label="聊天消息"
        >
          <template v-if="selected">
            <header
              class="flex shrink-0 flex-wrap items-center gap-3 border-b px-5 py-4"
            >
              <a-button
                type="text"
                class="chat-back"
                aria-label="返回会话列表"
                @click="chooseConversation('')"
              >
                <ArrowLeftOutlined />
              </a-button>
              <div class="min-w-0 flex-1">
                <div class="font-semibold">{{ selected.buyerName }}</div>
                <div class="text-muted-foreground mt-1 truncate text-xs">
                  {{ selectedMerchant?.name }} ·
                  {{
                    selectedMerchant
                      ? merchantPlatformText(selectedMerchant.platform)
                      : '—'
                  }}
                </div>
              </div>
              <a-button
                class="chat-order-toggle"
                type="text"
                @click="orderInfoOpen = true"
              >
                <template #icon><InfoCircleOutlined /></template>订单信息
              </a-button>
              <a-dropdown
                v-if="hasAccessByCodes(['merchant:chat:reply'])"
                :get-popup-container="getActionPopupContainer"
                :trigger="['click']"
              >
                <a-button
                  type="text"
                  :loading="deleting"
                  :disabled="loading || sending || creating"
                >
                  更多 <DownOutlined />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item
                      key="delete"
                      danger
                      @click="deleteConversation"
                    >
                      <DeleteOutlined /> 删除会话
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </header>
            <div
              class="bg-muted/30 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-3 text-sm"
            >
              <span class="font-semibold tabular-nums">
                {{ selected.order.fiatAmount }}
                {{ selected.order.fiatCurrency }}
              </span>
              <span class="text-muted-foreground tabular-nums">
                {{ formatChatDecimal(selected.order.assetAmount) }}
                {{ selected.order.asset }}
              </span>
              <ChatOrderStatus :order="selected.order" />
            </div>
            <div
              ref="messagePanel"
              class="chat-message-panel min-h-0 flex-1 overflow-y-auto"
              role="log"
              aria-label="当前聊天消息"
              aria-live="polite"
              aria-relevant="additions"
              @scroll="onMessageScroll"
            >
              <div
                class="chat-reading-column space-y-5 p-5"
                :class="{
                  'flex h-full items-center justify-center':
                    messages.length === 0,
                }"
              >
                <a-empty
                  v-if="messages.length === 0"
                  description="还没有聊天消息"
                >
                  <p class="text-muted-foreground text-xs">
                    {{
                      canReply
                        ? '可以发送第一条消息，与买家核实订单'
                        : composerHint
                    }}
                  </p>
                </a-empty>
                <div
                  v-for="item in messages"
                  :key="item.id"
                  class="flex"
                  :class="
                    item.origin === 'SELF' ? 'justify-end' : 'justify-start'
                  "
                >
                  <div class="max-w-[90%] sm:max-w-[80%]">
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
            </div>
            <div
              v-if="!atLatest && messages.length > 0"
              class="flex justify-center pb-2"
            >
              <a-button size="small" @click="jumpToLatest">
                <ArrowDownOutlined /> 回到最新消息
              </a-button>
            </div>
            <footer class="shrink-0 border-t">
              <div class="chat-reading-column px-5 py-4">
                <a-textarea
                  v-model:value="text"
                  aria-label="回复内容"
                  placeholder="输入回复内容"
                  :maxlength="4000"
                  :auto-size="{ minRows: 3, maxRows: 6 }"
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
                  <span
                    class="text-muted-foreground ml-auto text-xs"
                    role="status"
                  >
                    {{ composerHint }}
                  </span>
                  <a-button
                    type="primary"
                    :loading="sending"
                    :disabled="!canReply || (!text.trim() && !image)"
                    @click="send"
                  >
                    <template #icon><SendOutlined /></template>发送
                  </a-button>
                </div>
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
        <aside
          v-if="selected"
          class="chat-order-sidebar min-h-0 shrink-0 overflow-y-auto border-l"
          aria-label="订单信息"
        >
          <div class="border-b px-5 py-4 font-semibold">订单信息</div>
          <ChatOrderInfo
            :conversation="selected"
            :merchant="selectedMerchant"
          />
        </aside>
      </div>
    </div>
    <OrderSelectModal
      v-if="orderModalOpen"
      :open="orderModalOpen"
      :tenant-id="tenantId"
      :merchant-id="merchantId"
      :merchants="catalog"
      :creating="creating"
      @close="orderModalOpen = false"
      @select="openOrderConversation"
    />
    <a-drawer
      v-model:open="orderInfoOpen"
      title="订单信息"
      width="min(360px, 94vw)"
    >
      <ChatOrderInfo
        v-if="selected"
        :conversation="selected"
        :merchant="selectedMerchant"
      />
    </a-drawer>
  </Page>
</template>

<style scoped>
.chat-workspace {
  min-height: 420px;
}

.chat-sidebar {
  width: 304px;
}

.chat-order-sidebar {
  width: 292px;
}

.chat-conversation-active {
  background-color: hsl(var(--primary) / 8%);
  box-shadow: inset 3px 0 0 hsl(var(--primary));
}

.chat-reading-column {
  width: 100%;
  max-width: 880px;
  margin-inline: auto;
}

.chat-message-panel {
  background-color: hsl(var(--muted) / 20%);
}

.chat-order-toggle {
  display: none;
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
  width: 260px;
  min-width: 0;
  max-width: 100%;
}

.chat-filters :deep(.ant-form-item-control) {
  flex: 1;
  min-width: 0;
}

@media (width <= 1279px) {
  .chat-order-sidebar {
    display: none;
  }

  .chat-order-toggle {
    display: inline-flex;
  }
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
