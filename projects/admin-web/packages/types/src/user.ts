import type { BasicUserInfo } from '@vben-core/typings';

/** 用户信息 */
interface UserInfo extends BasicUserInfo {
  /**
   * 用户描述
   */
  description: string;

  /**
   * 是否绑定验证器
   */
  isOtpEnabled: boolean;
}

export type { UserInfo };
