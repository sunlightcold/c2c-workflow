import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
    otpCode?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }

  export interface RefreshTokenResult {
    data: string;
    status: number;
  }

  export interface LoginGraphicResult {
    uuid: string;
    data: string;
  }

  export interface OtpResult {
    uuid: string;
    uri: string;
  }

  export interface OtpBindParams {
    code: string;
    uuid: string;
  }

  export interface ModifyPwdParams {
    oldPwd: string;
    newPwd: string;
    code?: string;
  }

  export interface BaseInfoParams {
    nickname?: string;
    avatar?: string;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  return baseRequestClient.post<AuthApi.RefreshTokenResult>('/auth/refresh', {
    withCredentials: true,
  });
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return requestClient.post('/auth/logout');
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/permissions');
}

/**
 * 获取登录验证码
 */
export async function getLoginGraphicImgApi() {
  return requestClient.get<AuthApi.LoginGraphicResult>(
    '/auth/captcha?width=100&height=40',
  );
}

/**
 * 获取 OTP URL
 */
export async function getOPTUrlApi() {
  return requestClient.get<AuthApi.OtpResult>('/auth/optUrl');
}

/**
 * 绑定 OTP
 */
export async function bindOPTApi(data: AuthApi.OtpBindParams) {
  return requestClient.put('/auth/bindOtp', data);
}

/**
 * 解绑 OTP
 */
export async function unbindOPTApi(code: string) {
  return requestClient.put(`/auth/unbindOtp/${code}`);
}

/**
 * 修改密码
 */
export async function modifyPwdApi(data: AuthApi.ModifyPwdParams) {
  return requestClient.put(`/auth/modifyPwd`, data);
}

/**
 * 更新基本信息
 */
export async function updateAccountApi(data: AuthApi.BaseInfoParams) {
  return requestClient.put(`/auth/account`, data);
}
