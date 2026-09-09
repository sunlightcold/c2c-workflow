import type { UserInfo } from '@vben/types';

export type CurrentUserInfoResponse = Omit<UserInfo, 'uid'> & {
  id?: number | string;
  uid?: number | string;
};

export function normalizeCurrentUserInfo(
  userInfo: CurrentUserInfoResponse,
): UserInfo {
  const uid = userInfo.uid ?? userInfo.id;
  return {
    ...userInfo,
    uid: uid === undefined || uid === null ? '' : String(uid),
  };
}
