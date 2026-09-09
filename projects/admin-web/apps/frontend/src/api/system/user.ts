import type { UserInfo } from '@vben/types';

import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';
import type { RoleApi } from './role';
import type { CurrentUserInfoResponse } from './user-normalizer';

import { requestClient } from '#/api/request';

import { normalizeCurrentUserInfo } from './user-normalizer';

export namespace UserApi {
  export interface UserData {
    id: number;
    username: string;
    nickname: string;
    roles: RoleApi.RoleData[];
    description?: string;
  }

  export type UserFilterParams = CommonPageParams;
}

/**
 * 获取用户信息
 */
export async function getUserInfoApi() {
  const userInfo =
    await requestClient.get<CurrentUserInfoResponse>('/sys/users/info');
  return normalizeCurrentUserInfo(userInfo);
}

export function getUserListApi() {
  return requestClient.get<UserInfo[]>('/sys/users');
}

export function createUserApi(data: UserInfo) {
  return requestClient.post<UserInfo>('/sys/users', data);
}

export function updateUserApi(id: number, data: UserInfo) {
  return requestClient.put<UserInfo>(`/sys/users/${id}`, data);
}

export function removeUserApi(id: number) {
  return requestClient.delete(`/sys/users/${id}`);
}

export function getUserRolesApi(id: number) {
  return requestClient.get<string[]>(`/sys/users/roles/${id}`);
}

export function filterUsersApi(query: UserApi.UserFilterParams) {
  return requestClient.get<CommonPaginationData<UserInfo>>(
    `/sys/users/filter`,
    { params: query },
  );
}
