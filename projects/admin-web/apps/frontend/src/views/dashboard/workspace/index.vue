<script lang="ts" setup>
import { useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

const router = useRouter();

const entries = [
  {
    description: '维护后台账号、状态与角色分配',
    icon: 'lucide:users',
    label: '用户管理',
    path: '/system/user',
  },
  {
    description: '配置角色及其菜单、操作权限',
    icon: 'lucide:shield-check',
    label: '角色管理',
    path: '/system/role',
  },
  {
    description: '管理服务端注册的计划任务',
    icon: 'lucide:calendar-clock',
    label: '任务管理',
    path: '/monitor/task',
  },
  {
    description: '查询任务运行结果与失败原因',
    icon: 'lucide:scroll-text',
    label: '任务日志',
    path: '/monitor/task-log',
  },
] as const;

function open(path: string) {
  void router.push(path);
}
</script>

<template>
  <Page>
    <main class="mx-auto w-full max-w-6xl px-1 py-2 sm:px-2">
      <header class="mb-6 border-b pb-5">
        <p class="text-muted-foreground mb-1 text-sm">C2C 运营后台</p>
        <h1 class="text-foreground text-2xl font-semibold">工作台</h1>
        <p class="text-muted-foreground mt-2 text-sm">
          从系统权限和任务基座开始配置。商家、支付、机器人和代理商模块将在后续迭代接入。
        </p>
      </header>

      <section aria-labelledby="foundation-title">
        <h2 id="foundation-title" class="mb-3 text-base font-medium">
          基础管理
        </h2>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <article
            v-for="entry in entries"
            :key="entry.path"
            class="border-border bg-card flex min-h-40 flex-col border p-4"
          >
            <IconifyIcon
              :icon="entry.icon"
              class="text-primary mb-4 size-6"
              aria-hidden="true"
            />
            <h3 class="text-sm font-semibold">{{ entry.label }}</h3>
            <p class="text-muted-foreground mt-1 flex-1 text-sm leading-6">
              {{ entry.description }}
            </p>
            <AButton
              class="mt-4 self-start"
              type="link"
              @click="open(entry.path)"
            >
              进入
              <IconifyIcon icon="lucide:arrow-right" aria-hidden="true" />
            </AButton>
          </article>
        </div>
      </section>
    </main>
  </Page>
</template>
