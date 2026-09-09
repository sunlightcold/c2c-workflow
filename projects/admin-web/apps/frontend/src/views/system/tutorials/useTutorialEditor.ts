import type { Tutorial, TutorialLocale } from './tutorial.constants';

import { computed, onMounted, reactive, ref } from 'vue';

import { message, Modal } from 'ant-design-vue';

import {
  createTutorialApi,
  deleteTutorialApi,
  filterTutorialsApi,
  getTutorialApi,
  publishTutorialApi,
  unpublishTutorialApi,
  updateTutorialApi,
  uploadTutorialImageApi,
} from '#/api';

import {
  emptyTutorialContent,
  tutorialColumns,
  tutorialLocaleOptions,
} from './tutorial.constants';

export function useTutorialEditor() {
  const rows = ref<Tutorial[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const selectedId = ref<string>();
  const keyword = ref('');
  const locale = ref<TutorialLocale>();
  const pagination = reactive({ current: 1, pageSize: 20, total: 0 });
  const form = ref<{
    content: Tutorial['draft'];
    locale: TutorialLocale;
    slug: string;
  }>({
    content: emptyTutorialContent(),
    locale: 'zh',
    slug: '',
  });

  const selected = computed(() =>
    rows.value.find((tutorial) => tutorial.id === selectedId.value),
  );

  function assignTutorial(tutorial?: Tutorial) {
    selectedId.value = tutorial?.id;
    form.value = {
      content: { ...(tutorial?.draft ?? emptyTutorialContent()) },
      locale: tutorial?.locale ?? 'zh',
      slug: tutorial?.slug ?? '',
    };
  }

  async function loadTutorials(
    pageIndex = pagination.current,
    pageSize = pagination.pageSize,
  ) {
    loading.value = true;
    try {
      const result = await filterTutorialsApi({
        keyword: keyword.value || undefined,
        locale: locale.value,
        pageIndex,
        pageSize,
      });
      rows.value = result.items;
      pagination.current = result.meta.currentPage;
      pagination.pageSize = result.meta.itemsPerPage;
      pagination.total = result.meta.totalItems;
      if (selectedId.value) {
        const current = rows.value.find(({ id }) => id === selectedId.value);
        if (current) assignTutorial(current);
      }
    } finally {
      loading.value = false;
    }
  }

  function searchTutorials() {
    return loadTutorials(1, pagination.pageSize);
  }

  function paginateTutorials(pageIndex: number, pageSize: number) {
    return loadTutorials(pageIndex, pageSize);
  }

  async function selectTutorial(tutorial: Tutorial) {
    const detail = await getTutorialApi(tutorial.id);
    assignTutorial(detail);
  }

  function createTutorial() {
    assignTutorial();
  }

  function validateForm() {
    if (!form.value.content.title.trim() || !form.value.slug.trim()) {
      message.warning('请填写标题和路径');
      return false;
    }
    if (!form.value.content.markdown.trim()) {
      message.warning('请填写教程正文');
      return false;
    }
    return true;
  }

  async function persistDraft() {
    const payload = {
      content: { ...form.value.content },
      locale: form.value.locale,
      slug: form.value.slug.trim(),
    };
    const saved = selectedId.value
      ? await updateTutorialApi(selectedId.value, payload)
      : await createTutorialApi(payload);
    selectedId.value = saved.id;
    await loadTutorials();
    return saved;
  }

  async function saveTutorial() {
    if (!validateForm()) return;
    saving.value = true;
    try {
      await persistDraft();
      message.success('草稿已保存');
    } finally {
      saving.value = false;
    }
  }

  async function togglePublish() {
    if (!selected.value) return;
    if (!selected.value.publishedAt && !validateForm()) return;
    saving.value = true;
    try {
      if (selected.value.publishedAt) {
        await unpublishTutorialApi(selected.value.id);
        message.success('教程已下线');
      } else {
        const saved = await persistDraft();
        await publishTutorialApi(saved.id);
        message.success('教程已发布');
      }
      await loadTutorials();
    } finally {
      saving.value = false;
    }
  }

  function removeTutorial(tutorial: Tutorial) {
    Modal.confirm({
      content: `删除后无法恢复：${tutorial.draft.title}`,
      okButtonProps: { danger: true },
      okText: '删除',
      title: '删除教程',
      async onOk() {
        await deleteTutorialApi(tutorial.id);
        if (selectedId.value === tutorial.id) assignTutorial();
        await loadTutorials();
        message.success('教程已删除');
      },
    });
  }

  async function uploadMarkdownImages(
    files: File[],
    callback: (urls: string[]) => void,
  ) {
    const uploaded = await Promise.all(
      files.map((file) => uploadTutorialImageApi(file)),
    );
    callback(uploaded.map(({ url }) => url));
  }

  onMounted(loadTutorials);

  return {
    columns: tutorialColumns,
    createTutorial,
    form,
    keyword,
    loading,
    locale,
    localeOptions: tutorialLocaleOptions,
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
  };
}
