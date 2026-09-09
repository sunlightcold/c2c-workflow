<script lang="ts" setup>
import type { Tutorial, TutorialLocale } from './tutorial.constants';

import type { TutorialApi } from '#/api';

import { MdEditor } from 'md-editor-v3';

import 'md-editor-v3/lib/style.css';

type TutorialForm = {
  content: TutorialApi.Content;
  locale: TutorialLocale;
  slug: string;
};

defineProps<{
  localeOptions: Array<{ label: string; value: TutorialLocale }>;
  saving: boolean;
  selected?: Tutorial;
  selectedId?: string;
}>();

const emit = defineEmits<{
  save: [];
  togglePublish: [];
  uploadImages: [files: File[], callback: (urls: string[]) => void];
}>();

const form = defineModel<TutorialForm>('form', { required: true });

function uploadImages(files: File[], callback: (urls: string[]) => void) {
  emit('uploadImages', files, callback);
}
</script>

<template>
  <main class="tutorial-editor">
    <div class="editor-toolbar">
      <div>
        <h2>{{ selectedId ? '编辑教程' : '新建教程' }}</h2>
        <span>保存草稿不会影响线上内容</span>
      </div>
      <ASpace>
        <AButton
          v-if="selected"
          v-access:code="['system:tutorial:publish']"
          :loading="saving"
          @click="emit('togglePublish')"
        >
          {{ selected.publishedAt ? '下线' : '发布' }}
        </AButton>
        <AButton
          v-access:code="[
            selectedId ? 'system:tutorial:update' : 'system:tutorial:create',
          ]"
          :loading="saving"
          type="primary"
          @click="emit('save')"
        >
          保存草稿
        </AButton>
      </ASpace>
    </div>

    <AForm :model="form" layout="vertical">
      <div class="metadata-grid">
        <AFormItem label="标题" required>
          <AInput v-model:value="form.content.title" :maxlength="160" />
        </AFormItem>
        <AFormItem label="访问路径" required>
          <AInput v-model:value="form.slug" addon-before="/tutorials/" />
        </AFormItem>
        <AFormItem label="语言" required>
          <ASelect v-model:value="form.locale" :options="localeOptions" />
        </AFormItem>
        <AFormItem label="分区" required>
          <AInput v-model:value="form.content.section" :maxlength="80" />
        </AFormItem>
      </div>
      <AFormItem label="摘要">
        <ATextarea
          v-model:value="form.content.summary"
          :maxlength="300"
          :rows="2"
        />
      </AFormItem>
      <AFormItem label="正文" required>
        <MdEditor
          v-model="form.content.markdown"
          class="markdown-editor"
          language="zh-CN"
          @on-upload-img="uploadImages"
        />
      </AFormItem>
      <div class="seo-grid">
        <AFormItem label="SEO 标题">
          <AInput v-model:value="form.content.seoTitle" :maxlength="160" />
        </AFormItem>
        <AFormItem label="封面地址">
          <AInput v-model:value="form.content.coverUrl" />
        </AFormItem>
      </div>
      <AFormItem label="SEO 描述">
        <ATextarea
          v-model:value="form.content.seoDescription"
          :maxlength="320"
          :rows="2"
        />
      </AFormItem>
    </AForm>
  </main>
</template>

<style scoped>
.tutorial-editor {
  min-width: 0;
  padding: 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.editor-toolbar,
.metadata-grid,
.seo-grid {
  display: grid;
  gap: 12px;
}

.editor-toolbar {
  grid-template-columns: 1fr auto;
  align-items: center;
  margin-bottom: 16px;
}

.editor-toolbar h2 {
  margin: 0;
  font-size: 16px;
  line-height: 24px;
}

.editor-toolbar span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.metadata-grid {
  grid-template-columns: 1.4fr 1fr 120px 140px;
}

.seo-grid {
  grid-template-columns: 1fr 1fr;
}

.markdown-editor {
  height: calc(100vh - 560px);
  min-height: 360px;
}

@media (max-width: 720px) {
  .editor-toolbar,
  .metadata-grid,
  .seo-grid {
    grid-template-columns: 1fr;
  }
}
</style>
