import { requestClient } from '#/api/request';

export namespace UploadApi {
  export interface AvatarResult {
    avatar: string;
  }
}

export function updateAvatarApi(file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return requestClient.post<UploadApi.AvatarResult>(
    '/auth/account/avatar',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
}
