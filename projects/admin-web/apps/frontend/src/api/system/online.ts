import type {
  CommonPageParams,
  CommonPaginationData,
} from '../../../types/common';

import { requestClient } from '#/api/request';

export namespace OnlineApi {
  /**
   * 后台 Token 会话信息。
   *
   * status 表示 token 当前是否有活跃 WebSocket 连接。
   */
  export interface OnlineData {
    id: string;
    ip: string;
    os: string;
    browser: string;
    city: string;
    country: string;
    region: string;
    agent: string;
    nickname?: string;
    status: 'offline' | 'online';
    username?: string;
    createdAt: string;
    loginAt?: string;
    logoutAt?: string;
  }

  /**
   * 分页查询后台 Token 会话参数
   */
  export type OnlineFilterParams = CommonPageParams & {
    status?: 'offline' | 'online';
  };
}

export function filterOnlineApi(query: OnlineApi.OnlineFilterParams) {
  return requestClient.get<CommonPaginationData<OnlineApi.OnlineData>>(
    `/sys/online/filter`,
    { params: query },
  );
}

export function revokeOnlineSessionApi(id: string) {
  return requestClient.delete<{ revoked: boolean }>(`/sys/online/kick/${id}`);
}

export const offlineApi = revokeOnlineSessionApi;
