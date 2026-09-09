import type { TableColumnsType } from 'ant-design-vue';

import type { TutorialApi } from '#/api';

export type Tutorial = TutorialApi.TutorialData;
export type TutorialLocale = TutorialApi.Locale;

export const tutorialLocaleOptions: Array<{
  label: string;
  value: TutorialLocale;
}> = [
  { label: '简体中文', value: 'zh' },
  { label: 'English', value: 'en' },
  { label: '日本語', value: 'ja' },
  { label: '繁體中文', value: 'zh-Hant' },
];

export const tutorialColumns: TableColumnsType<Tutorial> = [
  { key: 'title', title: '标题', width: 240 },
  { dataIndex: 'locale', key: 'locale', title: '语言', width: 90 },
  { key: 'status', title: '状态', width: 90 },
  { dataIndex: 'updatedAt', key: 'updatedAt', title: '更新时间', width: 170 },
  { key: 'action', title: '操作', width: 80 },
];

export function emptyTutorialContent(): TutorialApi.Content {
  return {
    markdown: '',
    section: '',
    seoDescription: '',
    seoTitle: '',
    summary: '',
    title: '',
  };
}
