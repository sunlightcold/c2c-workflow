import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace TutorialApi {
  export type Locale = 'en' | 'ja' | 'zh' | 'zh-Hant';

  export interface Content {
    coverUrl?: string;
    markdown: string;
    section: string;
    seoDescription: string;
    seoTitle: string;
    summary: string;
    title: string;
  }

  export interface TutorialData {
    createdAt: string;
    draft: Content;
    id: string;
    locale: Locale;
    published: Content | null;
    publishedAt: null | string;
    slug: string;
    updatedAt: string;
  }

  export interface TutorialPayload {
    content: Content;
    locale: Locale;
    slug: string;
  }

  export type FilterParams = CommonPageParams & {
    keyword?: string;
    locale?: Locale;
  };
}

export function filterTutorialsApi(params: TutorialApi.FilterParams) {
  return requestClient.get<CommonPaginationData<TutorialApi.TutorialData>>(
    '/sys/tutorials',
    { params },
  );
}

export function getTutorialApi(id: string) {
  return requestClient.get<TutorialApi.TutorialData>(`/sys/tutorials/${id}`);
}

export function createTutorialApi(data: TutorialApi.TutorialPayload) {
  return requestClient.post<TutorialApi.TutorialData>('/sys/tutorials', data);
}

export function updateTutorialApi(
  id: string,
  data: TutorialApi.TutorialPayload,
) {
  return requestClient.put<TutorialApi.TutorialData>(
    `/sys/tutorials/${id}`,
    data,
  );
}

export function deleteTutorialApi(id: string) {
  return requestClient.delete(`/sys/tutorials/${id}`);
}

export function publishTutorialApi(id: string) {
  return requestClient.post<TutorialApi.TutorialData>(
    `/sys/tutorials/${id}/publish`,
  );
}

export function unpublishTutorialApi(id: string) {
  return requestClient.post<TutorialApi.TutorialData>(
    `/sys/tutorials/${id}/unpublish`,
  );
}

export function uploadTutorialImageApi(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<{ url: string }>(
    '/sys/tutorials/images',
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );
}
