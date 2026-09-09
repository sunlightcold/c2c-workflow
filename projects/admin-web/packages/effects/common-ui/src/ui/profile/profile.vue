<script setup lang="ts">
import type { Props } from './types';

import { computed } from 'vue';

import { $t } from '@vben/locales';

import { preferences } from '@vben-core/preferences';
import {
  Card,
  Tabs,
  TabsList,
  TabsTrigger,
  VbenAvatar,
} from '@vben-core/shadcn-ui';

import { Page } from '../../components';

defineOptions({
  name: 'ProfileUI',
});

const props = withDefaults(defineProps<Props>(), {
  tabs: () => [],
});

const tabsValue = defineModel<string>('modelValue');

const avatar = computed(
  () => props.userInfo?.avatar ?? preferences.app.defaultAvatar,
);
const displayName = computed(
  () => props.userInfo?.nickname || props.userInfo?.username || '--',
);
const username = computed(() => props.userInfo?.username || '--');
const accountId = computed(
  () => props.userInfo?.uid || props.userInfo?.id?.toString() || '--',
);

const activeTab = computed(() =>
  props.tabs.find((tab) => tab.value === tabsValue.value),
);

const accountItems = computed(() => [
  {
    label: $t('authentication.profileLoginAccount'),
    value: username.value,
  },
  {
    label: $t('authentication.profileUserId'),
    value: accountId.value,
  },
]);
</script>

<template>
  <Page auto-content-height content-class="profile-page">
    <div class="profile-shell">
      <aside class="profile-sidebar">
        <Card class="profile-card profile-identity-card">
          <div class="identity-row">
            <VbenAvatar
              :alt="displayName"
              :src="avatar"
              class="profile-avatar"
              dot
            />
            <div class="identity-copy">
              <strong>{{ displayName }}</strong>
              <span>{{ username }}</span>
            </div>
          </div>
        </Card>

        <Card class="profile-card">
          <dl class="account-list">
            <div v-for="item in accountItems" :key="item.label">
              <dt>{{ item.label }}</dt>
              <dd>{{ item.value }}</dd>
            </div>
          </dl>
        </Card>

        <Card class="profile-card">
          <Tabs v-model="tabsValue" orientation="vertical">
            <TabsList class="profile-tabs">
              <TabsTrigger
                v-for="tab in tabs"
                :key="tab.value"
                :value="tab.value"
                class="profile-tab"
              >
                <span>{{ tab.label }}</span>
                <small v-if="tab.description">{{ tab.description }}</small>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </Card>
      </aside>

      <main class="profile-main">
        <Card class="settings-card">
          <header class="settings-header">
            <div>
              <strong>{{ activeTab?.label }}</strong>
              <span>{{ activeTab?.description }}</span>
            </div>
          </header>
          <slot name="content"></slot>
        </Card>
      </main>
    </div>
  </Page>
</template>

<style lang="scss" scoped>
:deep(.profile-page) {
  overflow-x: hidden;
}

.profile-shell {
  display: grid;
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
  gap: 16px;
  min-height: 100%;
}

.profile-sidebar,
.profile-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.profile-card,
.settings-card {
  border-radius: 8px;
}

.profile-card {
  padding: 16px;
}

.profile-identity-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.identity-row {
  display: flex;
  gap: 12px;
  align-items: center;
  min-width: 0;
}

.profile-avatar {
  width: 56px;
  height: 56px;
}

.identity-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  strong,
  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 16px;
    font-weight: 600;
  }

  span {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;

  div {
    display: grid;
    grid-template-columns: 82px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-height: 28px;
  }

  dt {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }

  dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.profile-tabs {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
  width: 100%;
  height: auto;
  padding: 0;
  background: transparent;
}

.profile-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 52px;
  padding: 8px 10px;
  text-align: left;
  border-radius: 6px;

  small {
    max-width: 100%;
    margin-top: 3px;
    overflow: hidden;
    font-size: 12px;
    font-weight: 400;
    color: hsl(var(--muted-foreground));
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.settings-card {
  min-height: 0;
  padding: 18px;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  margin-bottom: 18px;
  border-bottom: 1px solid hsl(var(--border));

  div {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  strong {
    font-size: 16px;
    font-weight: 600;
  }

  span {
    font-size: 13px;
    color: hsl(var(--muted-foreground));
  }
}

@media (max-width: 1180px) {
  .profile-shell {
    grid-template-columns: 1fr;
  }

  .profile-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .profile-sidebar .profile-card:last-child {
    grid-column: 1 / -1;
  }

  .profile-tabs {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .profile-sidebar,
  .profile-tabs {
    grid-template-columns: 1fr;
  }

  .settings-card {
    padding: 14px;
  }
}
</style>
