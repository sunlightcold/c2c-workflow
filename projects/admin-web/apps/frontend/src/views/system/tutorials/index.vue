<script lang="ts" setup>
import { Page } from '@vben/common-ui';

import TutorialEditor from './TutorialEditor.vue';
import TutorialList from './TutorialList.vue';
import { useTutorialEditor } from './useTutorialEditor';

const {
  columns,
  createTutorial,
  form,
  keyword,
  loading,
  locale,
  localeOptions,
  paginateTutorials,
  pagination,
  removeTutorial,
  rows,
  saveTutorial,
  saving,
  searchTutorials,
  selected,
  selectedId,
  selectTutorial,
  togglePublish,
  uploadMarkdownImages,
} = useTutorialEditor();
</script>

<template>
  <Page auto-content-height>
    <div class="tutorial-page">
      <TutorialList
        v-model:keyword="keyword"
        v-model:locale="locale"
        :columns="columns"
        :loading="loading"
        :locale-options="localeOptions"
        :pagination="pagination"
        :rows="rows"
        :selected-id="selectedId"
        @create="createTutorial"
        @remove="removeTutorial"
        @paginate="paginateTutorials"
        @search="searchTutorials"
        @select="selectTutorial"
      />
      <TutorialEditor
        v-model:form="form"
        :locale-options="localeOptions"
        :saving="saving"
        :selected="selected"
        :selected-id="selectedId"
        @save="saveTutorial"
        @toggle-publish="togglePublish"
        @upload-images="uploadMarkdownImages"
      />
    </div>
  </Page>
</template>

<style scoped>
.tutorial-page {
  display: grid;
  grid-template-columns: minmax(420px, 0.8fr) minmax(560px, 1.2fr);
  gap: 16px;
  min-height: calc(100vh - 132px);
  padding: 16px;
}

@media (max-width: 1180px) {
  .tutorial-page {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .tutorial-page {
    padding: 8px;
  }
}
</style>
