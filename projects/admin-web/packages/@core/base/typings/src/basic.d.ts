interface BasicOption {
  label: string;
  value: string;
}

type SelectOption = BasicOption;

type TabOption = BasicOption;

interface BasicUserInfo {
  /**
   * 头像
   */
  avatar: string;
  /**
   * 首页路径
   */
  homePath?: string;
  /**
   * 后端用户id字段
   */
  id?: number | string;
  /**
   * 用户昵称
   */
  nickname: string;
  /**
   * 用户角色
   */
  roles?: string[];
  /**
   * 用户id
   */
  uid: string;
  /**
   * 用户名
   */
  username: string;
}

type ClassType = Array<object | string> | object | string;

export type { BasicOption, BasicUserInfo, ClassType, SelectOption, TabOption };
