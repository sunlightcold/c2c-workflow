<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { Tutorial, TutorialLocale } from './tutorial.constants';

import { DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';

defineProps<{
  columns: TableColumnsType<Tutorial>;
  keyword: string;
  loading: boolean;
  locale?: TutorialLocale;
  localeOptions: Array<{ label: string; value: TutorialLocale }>;
  pagination: TablePaginationConfig;
  rows: Tutorial[];
  selectedId?: string;
}>();

const emit = defineEmits<{
  create: [];
  paginate: [pageIndex: number, pageSize: number];
  remove: [tutorial: Tutorial];
  search: [];
  select: [tutorial: Tutorial];
  'update:keyword': [value: string];
  'update:locale': [value: TutorialLocale | undefined];
}>();

function changeLocale(value: TutorialLocale | undefined) {
  emit('update:locale', value);
  emit('search');
}

function changePage(pagination: TablePaginationConfig) {
  emit('paginate', pagination.current!, pagination.pageSize!);
}
</script>

<template>
  <aside class="tutorial-list">
    <div class="list-toolbar">
      <AInputSearch
        :value="keyword"
        allow-clear
        placeholder="搜索教程"
        @search="emit('search')"
        @update:value="emit('update:keyword', $event)"
      />
      <ASelect
        :value="locale"
        allow-clear
        :options="localeOptions"
        placeholder="全部语言"
        @change="changeLocale($event as TutorialLocale | undefined)"
      />
      <AButton
        v-access:code="['system:tutorial:create']"
        type="primary"
        @click="emit('create')"
      >
        <template #icon><PlusOutlined /></template>
        新建
      </AButton>
    </div>

    <ATable
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="pagination"
      :row-class-name="
        (record: Tutorial) => (record.id === selectedId ? 'is-selected' : '')
      "
      :scroll="{ x: 670, y: 'calc(100vh - 270px)' }"
      row-key="id"
      size="small"
      @change="changePage"
      @row="(record: Tutorial) => ({ onClick: () => emit('select', record) })"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div class="tutorial-title">
            <strong>{{ record.draft.title }}</strong>
            <span>/{{ record.slug }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
          <ATag :color="record.publishedAt ? 'green' : 'default'">
            {{ record.publishedAt ? '已发布' : '草稿' }}
          </ATag>
        </template>
        <template v-else-if="column.key === 'action'">
          <AButton
            v-access:code="['system:tutorial:delete']"
            danger
            size="small"
            type="text"
            title="删除教程"
            @click.stop="emit('remove', record as Tutorial)"
          >
            <template #icon><DeleteOutlined /></template>
          </AButton>
        </template>
      </template>
    </ATable>
  </aside>
</template>

<style scoped>
.tutorial-list {
  min-width: 0;
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.list-toolbar {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 130px auto;
  gap: 12px;
  margin-bottom: 12px;
}

.tutorial-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.tutorial-title strong,
.tutorial-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tutorial-title span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

:deep(.is-selected > td) {
  background: hsl(var(--accent));
}

@media (max-width: 1180px) {
  .tutorial-list {
    max-height: 420px;
  }
}

@media (max-width: 720px) {
  .list-toolbar {
    grid-template-columns: 1fr;
  }
}
</style>
